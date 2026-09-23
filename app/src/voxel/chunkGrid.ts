// Shared by density.ts (builds this) and meshWorker.ts (consumes this) — a
// flat solid/empty grid for one land-cube chunk. x/z are horizontal, y is
// vertical (matches Three.js's Y-up convention). Resolution (voxels/
// vertices per axis) is a user-facing control (ui/Panel.tsx's "Land Chunk"
// section) — see ISSUES.md, 2026-09-23.
export const DEFAULT_CHUNK_RESOLUTION = 16;
// World-space width/depth of the chunk's footprint — independent of
// resolution (Dana, 2026-09-23: resolution was incidentally also changing
// the chunk's physical size; it should only affect detail).
export const DEFAULT_CHUNK_SIZE = 16;

export function voxelIndex(x: number, y: number, z: number, resolution: number): number {
  return x + y * resolution + z * resolution * resolution;
}

// TODO(DS): a fixed, arbitrary test region on the heightmap — not yet tied
// to a real location the user picks on the planet. See ROADMAP.md, Stage 07.
const TEST_REGION_CENTER_U = 0.5;
const TEST_REGION_CENTER_V = 0.5;
const TEST_REGION_SIZE = 0.1; // fraction of the heightmap sampled per axis

// Samples the composited heightmap's normalized (0-1) height at one grid
// column (x,z) within the shared test region — used by both density.ts
// (voxel, x/z in [0, resolution)) and smoothMesh.ts (continuous patch, x/z
// in [0, resolution]) so both render styles read the exact same underlying
// terrain, not two independently-drifting copies.
export function sampleChunkHeight(heightmapImageData: ImageData, x: number, z: number, resolution: number): number {
  const { width, height, data } = heightmapImageData;
  const u = TEST_REGION_CENTER_U - TEST_REGION_SIZE / 2 + (x / resolution) * TEST_REGION_SIZE;
  const v = TEST_REGION_CENTER_V - TEST_REGION_SIZE / 2 + (z / resolution) * TEST_REGION_SIZE;
  const pixelX = Math.min(width - 1, Math.floor(u * width));
  const pixelY = Math.min(height - 1, Math.floor(v * height));
  // R channel — see heightmap.frag.glsl's composite convention (0.5 = neutral height).
  return data[(pixelY * width + pixelX) * 4] / 255;
}
