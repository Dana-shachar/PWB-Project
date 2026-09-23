import { voxelIndex } from './chunkGrid';

// One exposed face's 4 corners (unit-cube-local, counter-clockwise winding
// viewed from outside) plus the neighbor offset to check for culling.
// Winding hand-verified via the right-hand-rule cross product (not copied
// from an external source — this is a small, directly-derivable geometric
// fact, not a "well-established reference implementation" the project's
// verify-before-use rule targets, e.g. noise functions).
const FACES: { corners: [number, number, number][]; normal: [number, number, number] }[] = [
  { corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], normal: [1, 0, 0] }, // +X
  { corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], normal: [-1, 0, 0] }, // -X
  { corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], normal: [0, 1, 0] }, // +Y (top)
  { corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]], normal: [0, -1, 0] }, // -Y (bottom)
  { corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], normal: [0, 0, 1] }, // +Z
  { corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], normal: [0, 0, -1] }, // -Z
];

function isSolid(density: Uint8Array, x: number, y: number, z: number, resolution: number): boolean {
  if (x < 0 || y < 0 || z < 0 || x >= resolution || y >= resolution || z >= resolution) return false;
  return density[voxelIndex(x, y, z, resolution)] === 1;
}

// Cube/culled-face meshing — one flat quad per voxel face exposed to empty
// space, buried faces skipped entirely. Produces the blocky look directly,
// no interpolation (unlike Marching Cubes — see ISSUES.md, 2026-09-23).
// `size` is the footprint's world-space width/depth, independent of
// `resolution` — resolution only controls how many voxels subdivide that
// fixed size (Dana, 2026-09-23: "the res should affect detail level, not
// size"). Vertical scale is untouched by `size` — height is already
// independently governed by heightScale (see density.ts).
function buildMesh(density: Uint8Array, resolution: number, size: number): { positions: Float32Array; normals: Float32Array } {
  const positions: number[] = [];
  const normals: number[] = [];
  // Only x/z (horizontal) are centered, for on-screen framing — y is left
  // starting at 0 so the terrain's base sits at grid level (y=0) and rises
  // upward from there, matching the planet's own "ground sits on the grid"
  // convention, rather than half the chunk sitting below the grid plane
  // (Dana, 2026-09-23).
  const horizontalOffset = resolution / 2;
  const cellSize = size / resolution;

  for (let z = 0; z < resolution; z++) {
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        if (!isSolid(density, x, y, z, resolution)) continue;
        for (const face of FACES) {
          const [nx, ny, nz] = face.normal;
          if (isSolid(density, x + nx, y + ny, z + nz, resolution)) continue; // buried, never visible
          const [a, b, c, d] = face.corners;
          for (const corner of [a, b, c, a, c, d]) {
            positions.push((corner[0] + x - horizontalOffset) * cellSize, corner[1] + y, (corner[2] + z - horizontalOffset) * cellSize);
            normals.push(...face.normal);
          }
        }
      }
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals) };
}

// Sidesteps a real TS lib conflict: the project's shared tsconfig includes
// "DOM" (for the main app), and DOM's ambient `self`/`postMessage` typings
// are incompatible with a worker's actual signatures. A narrow local cast
// avoids referencing either ambient global, without touching the shared
// tsconfig just for this one file.
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<{ density: Uint8Array; resolution: number; size: number }>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

workerScope.onmessage = (event) => {
  const { positions, normals } = buildMesh(event.data.density, event.data.resolution, event.data.size);
  workerScope.postMessage({ positions, normals }, [positions.buffer, normals.buffer]);
};
