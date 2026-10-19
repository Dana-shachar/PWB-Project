import * as THREE from 'three';
import { CUBE_FACES, cubeFacePoint, type CubeFace } from './cubeFace';

// A patch is the single unit of terrain in this project: one piece of the
// planet's surface, with its own heightmap baked for it alone.
//
// Everything that shows terrain consumes patches. The planet is patches
// drawn curved; the land chunk is a patch drawn flat. There is no separate
// chunk pipeline, which is the point — "the chunk is a piece of the planet,
// zoomed in" is then true by construction rather than by two systems being
// kept in step.
//
// This follows how globe renderers work rather than being invented here. In
// Cesium the whole globe is made of terrain tiles, with a plain sphere
// treated as just a special case of terrain, and detail comes from
// descending the tree rather than from bigger textures: its heightmap tile
// format is a fixed 65x65 per tile. See REFERENCES.md.
export interface TerrainPatch {
  face: CubeFace;
  // The patch's rectangle in its face's own coordinates, each axis in [-1, 1].
  min: THREE.Vector2;
  max: THREE.Vector2;
  // How many times the face has been halved to reach this patch. Depth 0 is
  // a whole face. Each step doubles detail over the area it covers.
  depth: number;
}

// Samples per axis in a patch's baked heightmap: how finely the patch's
// ground is measured. Separate from depth, which is which ground the patch
// covers. The two are independent, and conflating them was wrong: you can be
// zoomed right in and still be looking at coarse data, exactly as you can
// zoom into a low-resolution photo (Dana, 2026-10-13: "res and zoom shouldnt
// be the same thing").
export const DEFAULT_PATCH_SAMPLES = 257;

// Bounded because cost rises with the square and every sample is copied back
// from the GPU. Letting a slider drive this unbounded is what stalled the
// chunk earlier.
export const MAX_PATCH_SAMPLES = 513;

export function clampPatchSamples(samples: number): number {
  return Math.min(MAX_PATCH_SAMPLES, Math.max(17, Math.round(samples)));
}

// A separate, much higher ceiling for a patch's *display* texture, used only
// where the result stays entirely GPU-side (never read back to the CPU) —
// the land chunk's smooth-mesh display, since the planet and the chunk now
// share one renderer/context (scene/sharedViewportRenderer.ts). MAX_PATCH_
// SAMPLES above still governs anything that does get read back (the color
// ramp's min/max, the voxel mesh's own CPU data), a real, different cost.
// 2048 is the real guaranteed WebGL2 texture-size floor (not a guess), this
// one's actually a hardware-grounded ceiling, not a round number picked by
// eye. See ISSUES.md, [B32].
export const MAX_PATCH_TEXTURE_RESOLUTION = 2048;

export function clampPatchTextureResolution(resolution: number): number {
  return Math.min(MAX_PATCH_TEXTURE_RESOLUTION, Math.max(17, Math.round(resolution)));
}

// Depth is capped so a runaway value can't ask for an absurd number of
// patches. At depth 8 a face is split 256 ways per axis, which is far more
// than anything currently reaches.
export const MAX_PATCH_DEPTH = 8;

export function rootPatch(face: CubeFace): TerrainPatch {
  return { face, min: new THREE.Vector2(-1, -1), max: new THREE.Vector2(1, 1), depth: 0 };
}

// The four patches this one splits into. The planet's level of detail walks
// this as the camera approaches; the chunk uses it to pick a patch at a
// given depth.
export function subdivide(patch: TerrainPatch): TerrainPatch[] {
  const mid = new THREE.Vector2().addVectors(patch.min, patch.max).multiplyScalar(0.5);
  const depth = patch.depth + 1;
  return [
    { face: patch.face, min: patch.min.clone(), max: mid.clone(), depth },
    { face: patch.face, min: new THREE.Vector2(mid.x, patch.min.y), max: new THREE.Vector2(patch.max.x, mid.y), depth },
    { face: patch.face, min: new THREE.Vector2(patch.min.x, mid.y), max: new THREE.Vector2(mid.x, patch.max.y), depth },
    { face: patch.face, min: mid.clone(), max: patch.max.clone(), depth },
  ];
}

// Walks down to `depth`, following whichever child contains `target` (a
// point in face coordinates). Used to ask for "the patch at this depth
// covering this spot", which is what zooming in means here: the area shrinks
// and the same number of samples covers it, so detail rises.
export function patchAtDepth(face: CubeFace, target: THREE.Vector2, depth: number): TerrainPatch {
  let patch = rootPatch(face);
  const limit = Math.min(Math.max(0, Math.round(depth)), MAX_PATCH_DEPTH);
  while (patch.depth < limit) {
    const children = subdivide(patch);
    patch = children.find((child) => target.x <= child.max.x && target.y <= child.max.y) ?? children[0];
  }
  return patch;
}

// The reverse of projecting the cube onto the sphere: given a direction from
// the planet's center, which face does it land on and where on that face.
// Used to turn a click on the planet into the patch under it.
//
// The method is the documented one: take the direction, find which axis
// dominates (that's the face), then divide the other two components by it to
// get the position on that face. Each case below is the algebraic inverse of
// the matching case in cubeFacePoint, so the two stay consistent by
// construction. See REFERENCES.md.
export function directionToFaceCoord(direction: THREE.Vector3): { face: CubeFace; coord: THREE.Vector2 } {
  const dir = direction.clone().normalize();
  const absX = Math.abs(dir.x);
  const absY = Math.abs(dir.y);
  const absZ = Math.abs(dir.z);

  if (absX >= absY && absX >= absZ) {
    const scale = absX;
    return dir.x > 0
      ? { face: '+X', coord: new THREE.Vector2(-dir.z / scale, dir.y / scale) }
      : { face: '-X', coord: new THREE.Vector2(dir.z / scale, dir.y / scale) };
  }
  if (absY >= absZ) {
    const scale = absY;
    return dir.y > 0
      ? { face: '+Y', coord: new THREE.Vector2(dir.x / scale, -dir.z / scale) }
      : { face: '-Y', coord: new THREE.Vector2(dir.x / scale, dir.z / scale) };
  }
  const scale = absZ;
  return dir.z > 0
    ? { face: '+Z', coord: new THREE.Vector2(dir.x / scale, dir.y / scale) }
    : { face: '-Z', coord: new THREE.Vector2(-dir.x / scale, dir.y / scale) };
}

// The patch at `depth` covering wherever `direction` points.
export function patchContaining(direction: THREE.Vector3, depth: number): TerrainPatch {
  const { face, coord } = directionToFaceCoord(direction);
  return patchAtDepth(face, coord, depth);
}

// Index into CUBE_FACES, which is what the bake shader takes.
export function faceIndex(face: CubeFace): number {
  return CUBE_FACES.indexOf(face);
}

// The patch's center as a direction on the unit sphere. The chunk uses this
// to know which piece of the planet it is showing.
export function patchCenterDirection(patch: TerrainPatch): THREE.Vector3 {
  const centerU = (patch.min.x + patch.max.x) / 2;
  const centerV = (patch.min.y + patch.max.y) / 2;
  return cubeFacePoint(patch.face, centerU, centerV).normalize();
}

// A patch, but with plain {x,y} objects instead of THREE.Vector2 instances —
// what a patch looks like once it has to survive a round trip through
// Firestore, which stores plain data, not class instances with methods.
// See firebase/storage.ts's SavedErosionRun.
export interface SerializedPatch {
  face: CubeFace;
  min: { x: number; y: number };
  max: { x: number; y: number };
  depth: number;
}

export function serializePatch(patch: TerrainPatch): SerializedPatch {
  return { face: patch.face, min: { x: patch.min.x, y: patch.min.y }, max: { x: patch.max.x, y: patch.max.y }, depth: patch.depth };
}

export function deserializePatch(serialized: SerializedPatch): TerrainPatch {
  return {
    face: serialized.face,
    min: new THREE.Vector2(serialized.min.x, serialized.min.y),
    max: new THREE.Vector2(serialized.max.x, serialized.max.y),
    depth: serialized.depth,
  };
}
