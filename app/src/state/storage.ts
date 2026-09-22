import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { NoiseLayer } from '../map/heightmap';

// One Firestore document per user (their project), keyed by their auth UID —
// see firestore.rules for the matching access rule. One project per user for
// now, not multiple named saves — see ROADMAP.md, Stage 06.
function projectDocRef(uid: string) {
  return doc(db, 'projects', uid);
}

export async function saveLayers(uid: string, layers: NoiseLayer[]): Promise<void> {
  await setDoc(projectDocRef(uid), { layers });
}

export async function loadLayers(uid: string): Promise<NoiseLayer[] | null> {
  const snapshot = await getDoc(projectDocRef(uid));
  if (!snapshot.exists()) return null;
  return (snapshot.data().layers as NoiseLayer[]) ?? null;
}
