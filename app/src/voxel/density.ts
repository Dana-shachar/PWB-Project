import { sampleChunkElevation, type ElevationData } from './chunkGrid';

// Builds one land cube's height-per-column grid from the existing
// composited heightmap (reused as-is, not a separate terrain generator —
// see ISSUES.md, 2026-09-23). A column is solid from y=0 up to its stored
// height, empty above — no caves/overhangs yet, this is v1.
//
// 2D (x/z only), not a 3D solid/empty grid — earlier versions stored a full
// Uint8Array(resolution^3), which is fundamentally cubic in both memory and
// meshing cost, hitting a real wall well before "high resolution" (512^3 is
// already ~134MB; 1024^3 is over a billion cells). Since there are no caves,
// a column is always "solid from the ground up to some height" and nothing
// more complex — so one height value per column is the complete
// representation, same O(resolution^2) shape as the smooth render style
// already uses. See ISSUES.md, 2026-09-23, and meshWorker.ts for the
// meshing technique this enables. `heightScale` is independent of
// `resolution` — see the same note previously here, now generalized.
export function buildChunkHeights(elevationData: ElevationData, resolution: number, heightScale: number): Uint32Array {
  const heights = new Uint32Array(resolution * resolution);
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      // +0.5 recenters elevation (terrain-zero-centered, see chunkGrid.ts)
      // back onto the old 0..1 convention this function was built around.
      // Clamped at 0 too now, not just resolution — elevation is
      // unclamped/can go negative (per-layer Height, additive — see
      // ISSUES.md, 2026-09-24), which the old always-0..1 texture couldn't.
      const heightNormalized = sampleChunkElevation(elevationData, x, z, resolution) + 0.5;
      heights[z * resolution + x] = Math.max(0, Math.min(resolution, Math.round(heightNormalized * heightScale)));
    }
  }
  return heights;
}
