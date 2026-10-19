import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './client';
import type { NoiseLayer, StrokeRecord } from '../map/heightmap';
import type { ErosionRates } from '../erosion/erosionEngine';
import type { SerializedPatch } from '../planet/patch';
import type { PlanetSettings } from '../planet/planetControls';

// What gets saved of a run: the panel's own settings plus which patch it
// ran on, not the simulation's state — erosion is deterministic (same
// patch, same rates, same duration always erode the same way), so the
// result is reconstructed by running it again on load, exactly how
// strokeHistory is replayed rather than a baked image stored ([S10] in
// SPEC.md). The real reason, not just the elegant one: a run's checkpoints
// alone run tens of megabytes, far past Firestore's 1MB document limit, so
// raw simulation state was never going to fit regardless.
export interface SavedErosionRun {
  rates: ErosionRates;
  durationYears: number;
  gridResolution: number;
  seaLevel: number;
  patch: SerializedPatch;
}

// Each user's saved planets live in a subcollection, not one fixed document
// — lets a user save multiple named planets and switch between them. See
// firestore.rules for the matching access rule, and ROADMAP.md, Stage 06.
function planetsCollection(uid: string) {
  return collection(db, 'projects', uid, 'planets');
}

export interface Project {
  name: string;
  layers: NoiseLayer[];
  // Every completed stroke, across all layers, in the order painted — the
  // source of truth for painted terrain (replayed to reconstruct the actual
  // paint textures on load), and what undo pops from. See ROADMAP.md, Stage 06.
  strokeHistory: StrokeRecord[];
  // null when no run has ever been done on this planet, or Reset was pressed.
  erosionRun: SavedErosionRun | null;
  // Display, Radius, Resolution, Height, the color ramp, Cast shadows — was
  // global app state shared across every planet until now, so switching
  // projects silently leaked one planet's settings into the next (Dana,
  // 2026-10-14: "it didn't save my colors to the project... the new
  // project colors remained"). null only for saves made before this
  // existed; loadProject() falls back to the real defaults, not whatever
  // happens to be in memory. See planet/planetControls.ts.
  planetSettings: PlanetSettings | null;
  updatedAt: number; // Date.now(), used to sort the project list and to auto-load the most recent on sign-in
}

// The lightweight info needed for the project-picker dropdown — a full
// Project's strokeHistory can be large, no reason to fetch it just to show
// a name. (Currently still fetches the full document under the hood, since
// Firestore has no partial-field reads without a separate summary doc —
// fine at this project's scale; revisit if the planet list ever gets long.)
export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export async function listProjects(uid: string): Promise<ProjectSummary[]> {
  const snapshot = await getDocs(planetsCollection(uid));
  return snapshot.docs
    .map((docSnapshot) => ({
      id: docSnapshot.id,
      name: (docSnapshot.data().name as string) ?? 'Untitled',
      updatedAt: (docSnapshot.data().updatedAt as number) ?? 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(uid: string, projectId: string): Promise<Project | null> {
  const snapshot = await getDoc(doc(planetsCollection(uid), projectId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    name: (data.name as string) ?? 'Untitled',
    layers: (data.layers as NoiseLayer[]) ?? [],
    strokeHistory: (data.strokeHistory as StrokeRecord[]) ?? [],
    erosionRun: (data.erosionRun as SavedErosionRun | null) ?? null,
    planetSettings: (data.planetSettings as PlanetSettings | null) ?? null,
    updatedAt: (data.updatedAt as number) ?? 0,
  };
}

export async function saveProject(
  uid: string,
  projectId: string,
  data: {
    name: string;
    layers: NoiseLayer[];
    strokeHistory: StrokeRecord[];
    erosionRun: SavedErosionRun | null;
    planetSettings: PlanetSettings;
  },
): Promise<void> {
  await setDoc(doc(planetsCollection(uid), projectId), { ...data, updatedAt: Date.now() });
}

export async function renameProject(uid: string, projectId: string, name: string): Promise<void> {
  await updateDoc(doc(planetsCollection(uid), projectId), { name });
}

export async function deleteProject(uid: string, projectId: string): Promise<void> {
  await deleteDoc(doc(planetsCollection(uid), projectId));
}

// A fresh id for a new planet — the caller decides when to actually create
// the document (via saveProject), this just reserves the id up front.
export function newProjectId(): string {
  return crypto.randomUUID();
}
