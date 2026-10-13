import * as THREE from 'three';
import type { CubeFace } from '../planet/cubeFace';

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

// Which piece of the planet the chunk is showing. The chunk is a terrain
// patch (planet/patch.ts) drawn flat rather than curved — the same unit the
// planet itself is made of, not a separate thing sampled out of a shared
// map. So "the chunk is a piece of the planet, zoomed in" holds by
// construction. See ISSUES.md, "Planet mesh and adaptive resolution".
//
// TODO(DS): the spot is still fixed rather than picked on the planet. Once
// picking exists it sets this target, and nothing else here changes.
// See ROADMAP.md, Stage 07.
export const CHUNK_FACE: CubeFace = '+X';
export const CHUNK_TARGET = new THREE.Vector2(0, 0);

// How far in the chunk starts. Depth is which ground it covers, not how
// finely that ground is measured — that's the patch's sample count.
// TODO(DS): arbitrary starting depth.
export const DEFAULT_CHUNK_DEPTH = 2;

// Raw single-channel elevation buffer — real unclamped height, not a display
// color. Same shape as map/heightmap.ts's ElevationReadback.
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
  // The buffer now covers exactly this chunk's own patch of the planet,
  // baked at the chunk's own resolution (see HeightmapPipeline.
  // renderRegion), so this reads it directly rather than picking a small
  // window out of the whole-planet map and enlarging it. That window was
  // what made the Resolution slider stop adding detail past a point: it
  // was ~102x51 pixels of a 1024x512 map however high the slider went.
  // See ISSUES.md, "Planet mesh and adaptive resolution".
  const pixelX = Math.min(width - 1, Math.round((x / resolution) * (width - 1)));
  const pixelY = Math.min(height - 1, Math.round((z / resolution) * (height - 1)));
  return data[pixelY * width + pixelX];
}
