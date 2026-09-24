// Column-based cube meshing — one flat top quad per solid column, plus a
// wall wherever two neighboring columns (including the chunk's own edge,
// treated as height 0) differ in height, spanning the difference. Produces
// the blocky look directly, no interpolation (unlike Marching Cubes — see
// ISSUES.md, 2026-09-23). This replaced a full 3D solid/empty grid + per-
// voxel-face culling — that was O(resolution^3) in both memory and meshing
// cost, hitting a real wall well before "high resolution" (see density.ts
// and ISSUES.md, 2026-09-23, for the full reasoning). Winding for each
// case hand-verified via the right-hand-rule cross product (not copied
// from an external source — a directly-derivable geometric fact, not a
// "well-established reference implementation" the project's verify-
// before-use rule targets, e.g. noise functions).

function heightAt(heights: Uint32Array, x: number, z: number, resolution: number): number {
  if (x < 0 || z < 0 || x >= resolution || z >= resolution) return 0; // outside the chunk — treated as empty, so the edge is just another height difference
  return heights[z * resolution + x];
}

// `size` is the footprint's world-space width/depth, independent of
// `resolution` (Dana, 2026-09-23: "the res should affect detail level, not
// size"). Vertical scale is untouched by `size` — height is already
// independently governed by heightScale, baked into `heights` already
// (see density.ts).
function buildMesh(heights: Uint32Array, resolution: number, size: number): { positions: Float32Array; normals: Float32Array } {
  const positions: number[] = [];
  const normals: number[] = [];
  const horizontalOffset = resolution / 2;
  const cellSize = size / resolution;

  function point(x: number, y: number, z: number): [number, number, number] {
    return [(x - horizontalOffset) * cellSize, y, (z - horizontalOffset) * cellSize];
  }
  function pushTriangle(p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], normal: [number, number, number]) {
    positions.push(...p0, ...p1, ...p2);
    normals.push(...normal, ...normal, ...normal);
  }
  function pushFlatQuad(p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], p3: [number, number, number], normal: [number, number, number]) {
    pushTriangle(p0, p1, p2, normal);
    pushTriangle(p0, p2, p3, normal);
  }

  // Top faces — one per solid column, always exposed (nothing above a
  // column's own top in a no-caves height field).
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      const h = heightAt(heights, x, z, resolution);
      if (h === 0) continue;
      pushFlatQuad(point(x, h, z), point(x, h, z + 1), point(x + 1, h, z + 1), point(x + 1, h, z), [0, 1, 0]);
    }
  }

  // X-direction walls — one boundary per (x, z) pair, x from 0 to
  // resolution inclusive so the chunk's own left/right edges are covered
  // by the same rule as internal steps (their "outside" neighbor is height 0).
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x <= resolution; x++) {
      const left = heightAt(heights, x - 1, z, resolution);
      const right = heightAt(heights, x, z, resolution);
      if (left === right) continue;
      if (right > left) {
        // Exposed face belongs to the right (taller) column's -X side.
        pushFlatQuad(point(x, right, z), point(x, left, z), point(x, left, z + 1), point(x, right, z + 1), [-1, 0, 0]);
      } else {
        // Exposed face belongs to the left (taller) column's +X side.
        pushFlatQuad(point(x, left, z + 1), point(x, right, z + 1), point(x, right, z), point(x, left, z), [1, 0, 0]);
      }
    }
  }

  // Z-direction walls — same rule, other axis.
  for (let x = 0; x < resolution; x++) {
    for (let z = 0; z <= resolution; z++) {
      const back = heightAt(heights, x, z - 1, resolution);
      const front = heightAt(heights, x, z, resolution);
      if (back === front) continue;
      if (front > back) {
        // Exposed face belongs to the front (taller) column's -Z side.
        pushFlatQuad(point(x, front, z), point(x + 1, front, z), point(x + 1, back, z), point(x, back, z), [0, 0, -1]);
      } else {
        // Exposed face belongs to the back (taller) column's +Z side.
        pushFlatQuad(point(x, back, z), point(x, front, z), point(x + 1, front, z), point(x + 1, back, z), [0, 0, 1]);
      }
    }
  }

  // Bottom cap — flat, spans the whole footprint, no subdivision needed.
  pushFlatQuad(point(0, 0, 0), point(resolution, 0, 0), point(resolution, 0, resolution), point(0, 0, resolution), [0, -1, 0]);

  return { positions: new Float32Array(positions), normals: new Float32Array(normals) };
}

// Sidesteps a real TS lib conflict: the project's shared tsconfig includes
// "DOM" (for the main app), and DOM's ambient `self`/`postMessage` typings
// are incompatible with a worker's actual signatures. A narrow local cast
// avoids referencing either ambient global, without touching the shared
// tsconfig just for this one file.
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<{ heights: Uint32Array; resolution: number; size: number }>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

workerScope.onmessage = (event) => {
  const { positions, normals } = buildMesh(event.data.heights, event.data.resolution, event.data.size);
  workerScope.postMessage({ positions, normals }, [positions.buffer, normals.buffer]);
};
