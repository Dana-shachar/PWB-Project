import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './client';
import type { NoiseLayer, StrokeRecord } from '../map/heightmap';

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
    updatedAt: (data.updatedAt as number) ?? 0,
  };
}

export async function saveProject(
  uid: string,
  projectId: string,
  data: { name: string; layers: NoiseLayer[]; strokeHistory: StrokeRecord[] },
): Promise<void> {
  await setDoc(doc(planetsCollection(uid), projectId), { ...data, updatedAt: Date.now() });
}

export async function renameProject(uid: string, projectId: string, name: string): Promise<void> {
  await updateDoc(doc(planetsCollection(uid), projectId), { name });
}

// A fresh id for a new planet — the caller decides when to actually create
// the document (via saveProject), this just reserves the id up front.
export function newProjectId(): string {
  return crypto.randomUUID();
}
