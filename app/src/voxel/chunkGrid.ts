// Shared by density.ts (builds this) and meshWorker.ts (consumes this) — a
// height-per-column grid for one land-cube chunk (x/z horizontal), not a
// full 3D solid/empty volume — see density.ts and ISSUES.md, 2026-09-23,
// for why. Resolution (columns per axis) is a user-facing control (ui/
// Panel.tsx's "Land Chunk" section).
export const DEFAULT_CHUNK_RESOLUTION = 16;
// World-space width/depth of the chunk's footprint — independent of
// resolution (Dana, 2026-09-23: resolution was incidentally also changing
// the chunk's physical size; it should only affect detail).
export const DEFAULT_CHUNK_SIZE = 16;

// TODO(DS): a fixed, arbitrary test region on the heightmap — not yet tied
// to a real location the user picks on the planet. See ROADMAP.md, Stage 07.
const TEST_REGION_CENTER_U = 0.5;
const TEST_REGION_CENTER_V = 0.5;
const TEST_REGION_SIZE = 0.1; // fraction of the heightmap sampled per axis

// Raw single-channel elevation buffer — HeightmapPipeline.getElevationData()'s
// return shape (map/heightmap.ts), real unclamped height, not a display color.
export interface ElevationData {
  data: Float32Array;
  width: number;
  height: number;
}

// Samples the composited heightmap's real elevation (each layer's own
// Height, additive — see heightmap.frag.glsl — not the 0..1 shape/paint
// channel the 2D canvas shows) at one grid column (x,z) within the shared
// test region — used by both density.ts (voxel, x/z in [0, resolution))
// and smoothMesh.ts (continuous patch, x/z in [0, resolution]) so both
// render styles read the exact same underlying terrain, not two
// independently-drifting copies. Returned value is centered on 0 (terrain's
// zero), same convention vertex.glsl uses for the planet — add 0.5 to
// recover the old 0..1-normalized convention density.ts/smoothMesh.ts were
// built around. See ISSUES.md, 2026-09-24.
export function sampleChunkElevation(elevationData: ElevationData, x: number, z: number, resolution: number): number {
  const { width, height, data } = elevationData;
  const u = TEST_REGION_CENTER_U - TEST_REGION_SIZE / 2 + (x / resolution) * TEST_REGION_SIZE;
  const v = TEST_REGION_CENTER_V - TEST_REGION_SIZE / 2 + (z / resolution) * TEST_REGION_SIZE;
  const pixelX = Math.min(width - 1, Math.floor(u * width));
  const pixelY = Math.min(height - 1, Math.floor(v * height));
  return data[pixelY * width + pixelX];
}
