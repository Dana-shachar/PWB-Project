import * as THREE from 'three';
import { CUBE_FACES, cubeFaceCoord, cubeFacePoint, type CubeFace } from './cubeFace';

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

// A patch's own *display-mesh* resolution ceiling (real triangle geometry,
// not a texture). Detail beyond it comes from more, smaller patches (see
// planetPatches.ts's screen-space-error selection), kept in check by the
// triangle budget there.
export const MAX_PATCH_GRID_RESOLUTION = 256;

// Mesh grids a planet patch can use, in cells across. The selection picks the
// largest one the visible patch count allows (planet/planetPatches.ts): few
// patches in view means each can carry a denser mesh. PREFERRED_PATCH_GRID is
// the smallest, used whenever many patches are visible.
export const PATCH_GRID_TIERS = [64, 128, 256];
export const PREFERRED_PATCH_GRID = PATCH_GRID_TIERS[0];

// How many samples a planet patch bakes across, chosen from how wide the
// patch is on screen so a texel stays near TARGET_BAKE_TEXEL_PIXELS pixels
// (a power of two plus one, like Cesium's 65). All of these are TUNABLE, not
// sourced rules. Floats are 16 bytes a texel: 257 samples is about 1 MB,
// 1025 about 17 MB.
export const PATCH_BAKE_SAMPLES_MIN = 65;
export const PATCH_BAKE_SAMPLES_MAX = 1025;
export const TARGET_BAKE_TEXEL_PIXELS = 2;
// Total baked texels for the patches in view (about 128 MB at 8M). Each
// visible patch's cap is its share of this, so a close-up of a few patches
// can bake large and a view of many stays small.
export const PATCH_BAKE_TEXEL_BUDGET = 8_000_000;
// A new patch bakes no larger than this at first (quick), then upgrades to
// its full size in a later frame, so a close-up never stalls on one big bake.
export const INITIAL_BAKE_SAMPLES = 257;

// The largest bake width (2^k + 1) a patch may use given how many patches are
// in view, the texel budget and the GPU's own texture limit.
export function bakeSamplesCap(visiblePatchCount: number, maxTextureSize: number): number {
  const share = Math.floor(Math.sqrt(PATCH_BAKE_TEXEL_BUDGET / Math.max(1, visiblePatchCount)));
  let samples = PATCH_BAKE_SAMPLES_MIN;
  while (samples * 2 - 1 <= Math.min(share, PATCH_BAKE_SAMPLES_MAX, maxTextureSize)) samples = samples * 2 - 1;
  return samples;
}

export function bakeSamplesForPixelWidth(patchPixelWidth: number, maxSamples = PATCH_BAKE_SAMPLES_MAX): number {
  const cells = 2 ** Math.ceil(Math.log2(Math.max(1, patchPixelWidth / TARGET_BAKE_TEXEL_PIXELS)));
  return Math.min(maxSamples, Math.max(PATCH_BAKE_SAMPLES_MIN, cells + 1));
}

// The planet Resolution slider is the maximum screen-space error in pixels,
// Cesium's maximumScreenSpaceError convention (Globe default 2, 3D Tiles
// default 16): lower is sharper. 8 is the automatic default; the planet still
// sharpens as you zoom, since error is measured on screen. Zoomed far out a
// lower value changes nothing visible, so it costs nothing there.
export const MIN_MAX_ERROR_PIXELS = 0.5;
export const MAX_MAX_ERROR_PIXELS = 32;
export const AUTO_MAX_ERROR_PIXELS = 8;
// The old slider's default (vertices across a cube face) was this: the
// reference point that maps to the automatic value.
const LEGACY_DEFAULT_RESOLUTION = 512;
// Settings saved before the slider was in pixels (3 stored a multiplier).
export const CURRENT_DETAIL_VERSION = 4;

export function clampMaxErrorPixels(pixels: number): number {
  return Math.min(MAX_MAX_ERROR_PIXELS, Math.max(MIN_MAX_ERROR_PIXELS, pixels));
}

// A legacy Resolution (vertices across one cube face) as a pixel threshold.
export function resolutionToMaxErrorPixels(legacyResolution: number): number {
  return clampMaxErrorPixels((AUTO_MAX_ERROR_PIXELS * LEGACY_DEFAULT_RESOLUTION) / Math.max(1, legacyResolution));
}

// The threshold a saved project should open with, by how it was saved:
// version 4 stores pixels; version 3 stored a multiplier (more is finer);
// version 2 (detailPerFace) stored a per-face resolution; older saves stored
// a per-patch grid (8 to 128), about an eighth of that, and open no finer than
// automatic so an old save isn't heavier than a new one.
export function migrateResolution(saved: {
  detailVersion?: number;
  maxErrorPixels?: number;
  detailBias?: number;
  meshSegments?: number;
  detailPerFace?: boolean;
}): number {
  if (saved.detailVersion === CURRENT_DETAIL_VERSION && typeof saved.maxErrorPixels === 'number') return clampMaxErrorPixels(saved.maxErrorPixels);
  if (saved.detailVersion === 3 && typeof saved.detailBias === 'number') return clampMaxErrorPixels(AUTO_MAX_ERROR_PIXELS / Math.max(0.01, saved.detailBias));
  const legacy = saved.meshSegments ?? LEGACY_DEFAULT_RESOLUTION;
  if (saved.detailPerFace) return resolutionToMaxErrorPixels(legacy);
  return Math.max(AUTO_MAX_ERROR_PIXELS, resolutionToMaxErrorPixels(legacy * 8));
}

export function clampPatchGridResolution(resolution: number): number {
  return Math.min(MAX_PATCH_GRID_RESOLUTION, Math.max(8, Math.round(resolution)));
}

// Depth is capped by float precision, not by an arbitrary count. A patch's
// bake reads its bounds as float32 (about 1.2e-7 steps near 1.0), and a
// sample's spacing at depth d is 2 / 2^d / (samples - 1): at depth 11 with
// 1025 samples that is 9.5e-7, so a float step is 6 to 13 percent of a sample;
// at 12 it is 12 to 25 percent, which shows as stepping. Vertex positions
// (magnitude up to about 24, steps 1.9e-6) stay under 4 percent of a mesh
// cell at 256 cells and depth 11. Going deeper needs per-tile local origins
// (AGI, "Precisions, Precisions"; CESIUM_RTC), which means changing the
// bake shader, so the cap stays here.
export const MAX_PATCH_DEPTH = 11;

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

// A patch's four edges, named as buildPatchGeometry names them (planet/
// planetPatchMesh.ts): top = min.y, bottom = max.y, left = min.x, right = max.x.
export type PatchEdge = 'top' | 'bottom' | 'left' | 'right';
export const PATCH_EDGES: PatchEdge[] = ['top', 'bottom', 'left', 'right'];

// Far smaller than the smallest patch (2 / 2^MAX_PATCH_DEPTH), so a probe
// lands inside whichever patch sits across an edge, never on a seam.
const PROBE_NUDGE = 1e-5;
const FACE_EDGE_LIMIT = 1 - 1e-9;

export interface EdgeProbe {
  face: CubeFace;
  coord: THREE.Vector2;
}

// A point just outside `patch`, across `edge`, `t` of the way along it (0 to
// 1), in whichever face it lands. Same-face edges just step outward. An edge
// on the cube's boundary crosses to the adjacent face: the point is taken to
// 3D on the cube edge (cubeFacePoint), the neighbor is the other face whose
// plane that point lies on, and the point is read back in that face's own
// (u, v) (cubeFaceCoord) and nudged inward. Deriving it from the cube's own
// geometry means it can't disagree with how faces are actually drawn, which a
// hand-written face-adjacency table could.
export function neighborProbe(patch: TerrainPatch, edge: PatchEdge, t: number): EdgeProbe {
  const alongU = patch.min.x + t * (patch.max.x - patch.min.x);
  const alongV = patch.min.y + t * (patch.max.y - patch.min.y);
  const edgeU = edge === 'left' ? patch.min.x : edge === 'right' ? patch.max.x : alongU;
  const edgeV = edge === 'top' ? patch.min.y : edge === 'bottom' ? patch.max.y : alongV;
  const outward = edge === 'left' || edge === 'top' ? -1 : 1;
  const stepU = edge === 'left' || edge === 'right' ? outward * PROBE_NUDGE : 0;
  const stepV = edge === 'top' || edge === 'bottom' ? outward * PROBE_NUDGE : 0;

  const crossesBoundary =
    (edge === 'left' && edgeU <= -FACE_EDGE_LIMIT) ||
    (edge === 'right' && edgeU >= FACE_EDGE_LIMIT) ||
    (edge === 'top' && edgeV <= -FACE_EDGE_LIMIT) ||
    (edge === 'bottom' && edgeV >= FACE_EDGE_LIMIT);
  if (!crossesBoundary) return { face: patch.face, coord: new THREE.Vector2(edgeU + stepU, edgeV + stepV) };

  const cubePoint = cubeFacePoint(patch.face, edgeU, edgeV);
  const faceCenter = cubeFacePoint(patch.face, 0, 0);
  const ownAxis = Math.abs(faceCenter.x) === 1 ? 'x' : Math.abs(faceCenter.y) === 1 ? 'y' : 'z';
  const neighborAxis = (['x', 'y', 'z'] as const).find((axis) => axis !== ownAxis && Math.abs(cubePoint[axis]) >= FACE_EDGE_LIMIT)!;
  const neighborFace = `${cubePoint[neighborAxis] > 0 ? '+' : '-'}${neighborAxis.toUpperCase()}` as CubeFace;
  const coord = cubeFaceCoord(neighborFace, cubePoint);
  // Step inward from whichever neighbor edge the point sits on.
  if (Math.abs(coord.x) >= FACE_EDGE_LIMIT) coord.x -= Math.sign(coord.x) * PROBE_NUDGE;
  else coord.y -= Math.sign(coord.y) * PROBE_NUDGE;
  return { face: neighborFace, coord };
}

// Which of a patch's edges lie on the cube's boundary, and the face each one
// crosses into. Everything else in the system treats a cross-face neighbor as
// just another neighbor via neighborProbe; this is the lookup behind it.
export function crossFaceNeighbors(patch: TerrainPatch): { edge: PatchEdge; face: CubeFace }[] {
  const result: { edge: PatchEdge; face: CubeFace }[] = [];
  for (const edge of PATCH_EDGES) {
    const probe = neighborProbe(patch, edge, 0.5);
    if (probe.face !== patch.face) result.push({ edge, face: probe.face });
  }
  return result;
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
