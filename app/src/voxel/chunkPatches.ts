import * as THREE from 'three';
import { balance, buildLeafIndex, coveringLeaves, MERGE_SSE_RATIO, type LeafFrame, type LeafIndex } from '../planet/planetPatches';
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
  // The ground's heights (rows top to bottom, raw), so a patch's distance is measured to its own ground. Absent until read.
  ground?: { data: Float32Array; size: number; heightBase: number };
}

// The chunk's square as the frame its patches are looked up in: a drawn square doesn't sit on the cube face's grid.
export function chunkFrame(root: TerrainPatch): LeafFrame {
  return { minX: root.min.x, minY: root.min.y, size: root.max.x - root.min.x, depth: root.depth };
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

// The patch's column of ground as a box, centered on the chunk's origin, from its own ground's low and high with the
// slab's lift: CDLOD bounds each node by the min and max height of its area (Strugar 2009), for both culling and detail.
// 0 to maxHeight left lifted ground above its box, so the patch underfoot read as out of view (measured 2026-11-09).
export function chunkPatchBox(root: TerrainPatch, patch: TerrainPatch, detail: ChunkDetail, out: THREE.Box3): THREE.Box3 {
  const fractions = rootFractions(root, patch);
  const size = detail.chunkSize;
  out.min.set((fractions.minU - 0.5) * size, detail.minHeight, (fractions.minV - 0.5) * size);
  out.max.set((fractions.maxU - 0.5) * size, detail.maxHeight, (fractions.maxV - 0.5) * size);
  if (detail.ground) {
    const [low, high] = patchGroundRange(root, patch, detail.ground);
    out.min.y = Math.max(0, low + detail.ground.heightBase) * detail.maxHeight;
    out.max.y = Math.max(0, high + detail.ground.heightBase) * detail.maxHeight;
  }
  return out;
}

const scratchBox = new THREE.Box3();

// A patch's lowest and highest raw ground, read once per ground map; includes the grid cell around it, as the grid is coarser than deep patches.
const groundRanges = new WeakMap<Float32Array, Map<string, [number, number]>>();
function patchGroundRange(root: TerrainPatch, patch: TerrainPatch, ground: NonNullable<ChunkDetail['ground']>): [number, number] {
  let cache = groundRanges.get(ground.data);
  if (!cache) {
    cache = new Map();
    groundRanges.set(ground.data, cache);
  }
  const key = `${patch.depth}:${patch.min.x}:${patch.min.y}`;
  const known = cache.get(key);
  if (known) return known;
  const fractions = rootFractions(root, patch);
  const last = ground.size - 1;
  const firstCol = Math.max(0, Math.floor(fractions.minU * last) - 1);
  const lastCol = Math.min(last, Math.ceil(fractions.maxU * last) + 1);
  const firstRow = Math.max(0, Math.floor((1 - fractions.maxV) * last) - 1);
  const lastRow = Math.min(last, Math.ceil((1 - fractions.minV) * last) + 1);
  let low = Infinity;
  let high = -Infinity;
  for (let row = firstRow; row <= lastRow; row++) {
    for (let col = firstCol; col <= lastCol; col++) {
      const raw = ground.data[row * ground.size + col];
      if (raw < low) low = raw;
      if (raw > high) high = raw;
    }
  }
  const range: [number, number] = [low, high];
  cache.set(key, range);
  return range;
}

// Measured to the patch's own ground: the chunk's whole height range counted distant patches as close, over-splitting them.
function distanceToPatch(root: TerrainPatch, patch: TerrainPatch, cameraPosition: THREE.Vector3, detail: ChunkDetail): number {
  chunkPatchBox(root, patch, detail, scratchBox);
  if (detail.ground) {
    const [low, high] = patchGroundRange(root, patch, detail.ground);
    scratchBox.min.y = Math.max(0, low + detail.ground.heightBase) * detail.maxHeight;
    scratchBox.max.y = Math.max(0, high + detail.ground.heightBase) * detail.maxHeight;
  }
  const distance = scratchBox.distanceToPoint(cameraPosition);
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
  frame: LeafFrame;
  previousIndex?: LeafIndex;
}

function wasSplit(patch: TerrainPatch, context: ChunkContext): boolean {
  if (!context.previousIndex) return false;
  return coveringLeaves(context.previousIndex, patch, context.frame).some((leaf) => leaf.depth > patch.depth);
}

// Mesh cell spacing in pixels against the threshold, with merge hysteresis. Detail comes from distance only, as in CDLOD
// (Strugar 2009): the view decides what is drawn, not how detailed, so turning on the spot never swaps patches (50 of 298
// frames swapped during a 3 s pan, read as flicker; 0 with distance only, measured 2026-11-09).
function shouldSplit(patch: TerrainPatch, context: ChunkContext): boolean {
  if (patch.depth >= context.maxDepth) return false;
  const split = wasSplit(patch, context);
  const worldSize = chunkPatchWorldSize(context.root, patch, context.detail.chunkSize);
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
  const frame = chunkFrame(root);
  const context: ChunkContext = {
    root,
    maxDepth: root.depth + CHUNK_MAX_EXTRA_DEPTH,
    cameraPosition,
    detail,
    threshold: detail.maxErrorPixels,
    frame,
    previousIndex: previousLeaves ? buildLeafIndex(previousLeaves, frame) : undefined,
  };
  let leaves: TerrainPatch[] = [];
  for (let pressure = 0; pressure <= MAX_PRESSURE; pressure++) {
    context.threshold = detail.maxErrorPixels * PRESSURE_THRESHOLD_STEP ** pressure;
    leaves = [];
    collectLeaves(root, context, leaves);
    if (leaves.length * 2 * PATCH_GRID ** 2 <= CHUNK_MAX_TRIANGLES) break;
  }
  lastThreshold = context.threshold;
  return balance(leaves, frame);
}

// The error threshold the last selection settled on (the triangle budget can raise it), for morphRange.
let lastThreshold = 8;
export function chunkSelectionThreshold(): number {
  return lastThreshold;
}

// A patch blends into its next-coarser level over the last share of its distance range, as CDLOD does (Strugar 2009:
// "the last 15%-30% of every LOD range"). The range ends where the parent's own error reaches the threshold, the distance
// at which the parent alone would have been chosen; a coarser neighbor is never closer than that, so a shared edge is
// fully blended on the fine side. Distances in world units, from the eye to each vertex (chunk.vert.glsl).
const MORPH_SHARE = 0.3; // of the range, CDLOD's upper bound. TUNABLE
export function morphRange(root: TerrainPatch, patch: TerrainPatch, detail: ChunkDetail, threshold: number): [number, number] {
  const parentCellSize = (2 * chunkPatchWorldSize(root, patch, detail.chunkSize)) / PATCH_GRID;
  const end = (parentCellSize * detail.viewHeightPixels) / (2 * Math.tan(detail.fieldOfViewRadians / 2) * threshold);
  return [end * (1 - MORPH_SHARE), end];
}
