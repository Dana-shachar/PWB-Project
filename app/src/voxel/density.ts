import { voxelIndex, sampleChunkHeight } from './chunkGrid';

// Builds one land cube's solid/empty grid from the existing composited
// heightmap (reused as-is, not a separate terrain generator — see
// ISSUES.md, 2026-09-23) — a column is solid below the sampled height,
// empty above. No caves/overhangs yet, this is v1. `heightScale` is
// independent of `resolution` (Dana, 2026-09-23: it used to scale with
// resolution incidentally, making taller resolutions look "extreme") —
// clamped to `resolution` since a voxel column can't exceed the grid it's in.
export function buildTestChunkDensity(heightmapImageData: ImageData, resolution: number, heightScale: number): Uint8Array {
  const density = new Uint8Array(resolution ** 3);

  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      const heightNormalized = sampleChunkHeight(heightmapImageData, x, z, resolution);
      const solidLevels = Math.min(resolution, Math.round(heightNormalized * heightScale));
      for (let y = 0; y < resolution; y++) {
        density[voxelIndex(x, y, z, resolution)] = y < solidLevels ? 1 : 0;
      }
    }
  }
  return density;
}
