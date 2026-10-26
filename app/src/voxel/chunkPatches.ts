import * as THREE from 'three';
import { balance, buildLeafIndex, coveringLeaves, MERGE_SSE_RATIO, type LeafIndex } from '../planet/planetPatches';
import { PATCH_GRID, subdivide, type TerrainPatch } from '../planet/patch';

// The land chunk's level of detail: the planet's screen-space-error rule
// (chunked LOD, CDLOD) over one flat square instead of a sphere. The chunk's
// own patch is the only root; each split halves a patch's share of the square.

// How many levels the chunk may split below its own patch. Tunable, inferred.
export const CHUNK_MAX_EXTRA_DEPTH = 10;
// The most triangles worth drawing; over it the pixel threshold steps up.
const CHUNK_MAX_TRIANGLES = 3_000_000;
const PRESSURE_THRESHOLD_STEP = 1.25;
const MAX_PRESSURE = 16;
// Keeps a camera touching the ground from dividing by zero, as a share of the chunk.
const MIN_DISTANCE_FRACTION = 1e-5;

export interface ChunkDetail {
  maxErrorPixels: number;
  viewHeightPixels: number;
  fieldOfViewRadians: number;
  frustum: THREE.Frustum;
  chunkSize: number;
  // The lowest and highest the chunk's ground can be, in world units.
  minHeight: number;
  maxHeight: number;
}

// Where a patch sits on the chunk's square, as fractions of the root: u along
// x and v along z, the same layout as the old single mesh's uv.
export function rootFractions(root: TerrainPatch, patch: TerrainPatch): { minU: number; minV: number; maxU: number; maxV: number } {
  const width = root.max.x - root.min.x;
  const height = root.max.y - root.min.y;
  return {
    minU: (patch.min.x - root.min.x) / width,
    minV: (patch.min.y - root.min.y) / height,
    maxU: (patch.max.x - root.min.x) / width,
    maxV: (patch.max.y - root.min.y) / height,
  };
}

export function chunkPatchWorldSize(root: TerrainPatch, patch: TerrainPatch, chunkSize: number): number {
  return ((patch.max.x - patch.min.x) / (root.max.x - root.min.x)) * chunkSize;
}

// The patch's column of ground as a box, centered on the chunk's origin.
export function chunkPatchBox(root: TerrainPatch, patch: TerrainPatch, detail: ChunkDetail, out: THREE.Box3): THREE.Box3 {
  const fractions = rootFractions(root, patch);
  const size = detail.chunkSize;
  out.min.set((fractions.minU - 0.5) * size, detail.minHeight, (fractions.minV - 0.5) * size);
  out.max.set((fractions.maxU - 0.5) * size, detail.maxHeight, (fractions.maxV - 0.5) * size);
  return out;
}

const scratchBox = new THREE.Box3();

function distanceToPatch(root: TerrainPatch, patch: TerrainPatch, cameraPosition: THREE.Vector3, detail: ChunkDetail): number {
  const distance = chunkPatchBox(root, patch, detail, scratchBox).distanceToPoint(cameraPosition);
  return Math.max(distance, detail.chunkSize * MIN_DISTANCE_FRACTION);
}

function pixelsPerWorldUnit(distance: number, detail: ChunkDetail): number {
  return detail.viewHeightPixels / (distance * 2 * Math.tan(detail.fieldOfViewRadians / 2));
}

// How wide a patch appears on screen, in pixels, for choosing its bake size.
export function chunkPatchPixelWidth(root: TerrainPatch, patch: TerrainPatch, cameraPosition: THREE.Vector3, detail: ChunkDetail): number {
  return chunkPatchWorldSize(root, patch, detail.chunkSize) * pixelsPerWorldUnit(distanceToPatch(root, patch, cameraPosition, detail), detail);
}

export function chunkPatchInView(root: TerrainPatch, patch: TerrainPatch, detail: ChunkDetail, inflate = 0): boolean {
  chunkPatchBox(root, patch, detail, scratchBox);
  if (inflate > 0) scratchBox.expandByScalar(inflate);
  return detail.frustum.intersectsBox(scratchBox);
}

interface ChunkContext {
  root: TerrainPatch;
  maxDepth: number;
  cameraPosition: THREE.Vector3;
  detail: ChunkDetail;
  threshold: number;
  previousIndex?: LeafIndex;
}

function wasSplit(patch: TerrainPatch, context: ChunkContext): boolean {
  if (!context.previousIndex) return false;
  return coveringLeaves(context.previousIndex, patch).some((leaf) => leaf.depth > patch.depth);
}

// Same rule as the planet's shouldSplit: mesh cell spacing in pixels against
// the threshold, with merge hysteresis and no splitting outside the view.
function shouldSplit(patch: TerrainPatch, context: ChunkContext): boolean {
  if (patch.depth >= context.maxDepth) return false;
  const split = wasSplit(patch, context);
  const worldSize = chunkPatchWorldSize(context.root, patch, context.detail.chunkSize);
  if (!chunkPatchInView(context.root, patch, context.detail, split ? worldSize * 0.25 : 0)) return false;
  const error = (worldSize / PATCH_GRID) * pixelsPerWorldUnit(distanceToPatch(context.root, patch, context.cameraPosition, context.detail), context.detail);
  return error > (split ? context.threshold * MERGE_SSE_RATIO : context.threshold);
}

function collectLeaves(patch: TerrainPatch, context: ChunkContext, out: TerrainPatch[]): void {
  if (shouldSplit(patch, context)) {
    for (const child of subdivide(patch)) collectLeaves(child, context, out);
  } else {
    out.push(patch);
  }
}

// This frame's patches for the chunk, balanced so neighbors differ by at most
// one level. Over the triangle budget, the threshold rises until it fits.
export function selectChunkPatches(root: TerrainPatch, cameraPosition: THREE.Vector3, detail: ChunkDetail, previousLeaves?: TerrainPatch[]): TerrainPatch[] {
  const context: ChunkContext = {
    root,
    maxDepth: root.depth + CHUNK_MAX_EXTRA_DEPTH,
    cameraPosition,
    detail,
    threshold: detail.maxErrorPixels,
    previousIndex: previousLeaves ? buildLeafIndex(previousLeaves) : undefined,
  };
  let leaves: TerrainPatch[] = [];
  for (let pressure = 0; pressure <= MAX_PRESSURE; pressure++) {
    context.threshold = detail.maxErrorPixels * PRESSURE_THRESHOLD_STEP ** pressure;
    leaves = [];
    collectLeaves(root, context, leaves);
    if (leaves.length * 2 * PATCH_GRID ** 2 <= CHUNK_MAX_TRIANGLES) break;
  }
  return balance(leaves);
}
