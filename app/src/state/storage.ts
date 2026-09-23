import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { NoiseLayer, StrokeRecord } from '../map/heightmap';

// One Firestore document per user (their project), keyed by their auth UID —
// see firestore.rules for the matching access rule. One project per user for
// now, not multiple named saves — see ROADMAP.md, Stage 06.
function projectDocRef(uid: string) {
  return doc(db, 'projects', uid);
}

export interface ProjectData {
  layers: NoiseLayer[];
  // Every completed stroke, across all layers, in the order painted — the
  // source of truth for painted terrain (replayed to reconstruct the actual
  // paint textures on load), and what undo pops from. See ROADMAP.md, Stage 06.
  strokeHistory: StrokeRecord[];
}

export async function saveProject(uid: string, data: ProjectData): Promise<void> {
  await setDoc(projectDocRef(uid), data);
}

export async function loadProject(uid: string): Promise<ProjectData | null> {
  const snapshot = await getDoc(projectDocRef(uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    layers: (data.layers as NoiseLayer[]) ?? [],
    strokeHistory: (data.strokeHistory as StrokeRecord[]) ?? [],
  };
}
