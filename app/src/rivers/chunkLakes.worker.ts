// The land chunk's lakes, solved on the chunk's own ground: the planet's depression hierarchy and Fill-Spill-Merge with the
// climate's lakeShare, so a lake can never stand above its rim.
import { buildDepressionHierarchy, fillSpillMerge } from './depressions';
import { NodeHeap } from './pitFill';
import { waterBudget, type RiverClimate } from './riverClimate';

export const NO_CHUNK_LAKE = -1000;
export const SEA_NEVER_REACHES = 1000; // the spill height of a cell no tide reaches (no sea on the square)
// A lake's tide is the sea's times its width over the planet's radius (Lake Superior: about 0.09, so about 4 cm, within
// NOAA's "less than five centimeters"). 0: lakes don't follow the tide (Dana, 2026-11-04; it moved a big lake 30 units).
const LAKE_TIDE_BOOST = 0;

export interface ChunkLakesRequest {
  ground: Float32Array;
  planetLakes: Float32Array; // the planet's lake level per cell, NO_CHUNK_LAKE off its lakes
  size: number;
  seaLevel: number;
  climate: RiverClimate;
  chunkKm: number;
  radiusKm: number;
  metersPerRaw: number; // the chunk's drawn meters per raw height unit, for the breach limits
  requestId: number;
}

function squareNeighbors(size: number): { neighborStarts: Int32Array; neighborList: Int32Array } {
  const neighborStarts = new Int32Array(size * size + 1);
  const neighborList = new Int32Array(size * size * 8);
  let count = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      neighborStarts[row * size + col] = count;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nextRow = row + dy;
          const nextCol = col + dx;
          if ((dx !== 0 || dy !== 0) && nextRow >= 0 && nextRow < size && nextCol >= 0 && nextCol < size) neighborList[count++] = nextRow * size + nextCol;
        }
      }
    }
  }
  neighborStarts[size * size] = count;
  return { neighborStarts, neighborList };
}

// The highest water each cell can hold before spilling to the sea: Priority-Flood (Barnes et al. 2014) from the sea cells.
// The cut sides aren't outlets here, since a planet lake's rim may lie past the cut.
function spillHeights(ground: Float32Array, seaLevel: number, neighborStarts: Int32Array, neighborList: Int32Array, heap: NodeHeap): Float32Array {
  const spill = new Float32Array(ground.length).fill(Infinity);
  heap.size = 0;
  for (let cell = 0; cell < ground.length; cell++) {
    if (ground[cell] < seaLevel) {
      spill[cell] = seaLevel;
      heap.push(cell, seaLevel);
    }
  }
  while (heap.size > 0) {
    const cell = heap.pop();
    for (let k = neighborStarts[cell]; k < neighborStarts[cell + 1]; k++) {
      const next = neighborList[k];
      if (spill[next] !== Infinity) continue;
      spill[next] = Math.max(ground[next], spill[cell]);
      heap.push(next, spill[next]);
    }
  }
  return spill;
}

// The planet's lakes on the chunk's own ground: from the planet's outline, water at its level spreads to every neighbor
// whose ground is below it (a flood fill), capped at each cell's spill height so it never stands as a cliff ([B134]).
function floodPlanetLakes(ground: Float32Array, planetLakes: Float32Array, spill: Float32Array, size: number, seaLevel: number): Float32Array {
  const level = new Float32Array(size * size).fill(NO_CHUNK_LAKE);
  const queue: number[] = [];
  for (let cell = 0; cell < level.length; cell++) {
    const capped = Math.min(planetLakes[cell], spill[cell]);
    if (capped > ground[cell] && ground[cell] >= seaLevel) {
      level[cell] = capped;
      queue.push(cell);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    const row = Math.floor(cell / size);
    const col = cell % size;
    for (const [nextRow, nextCol] of [[row + 1, col], [row - 1, col], [row, col + 1], [row, col - 1]]) {
      if (nextRow < 0 || nextCol < 0 || nextRow >= size || nextCol >= size) continue;
      const next = nextRow * size + nextCol;
      // The sea stops it, as it stops the chunk's own lakes: a lake never spreads over the sea floor.
      const capped = Math.min(level[cell], spill[next]);
      if (ground[next] < capped && ground[next] >= seaLevel && level[next] < capped) {
        level[next] = capped;
        queue.push(next);
      }
    }
  }
  return level;
}

// Each lake cell's lake area in cells: connected cells at the same level.
function lakeAreas(level: Float32Array, size: number): Int32Array {
  const area = new Int32Array(size * size);
  const seen = new Uint8Array(size * size);
  for (let start = 0; start < level.length; start++) {
    if (seen[start] || level[start] <= NO_CHUNK_LAKE) continue;
    const members = [start];
    seen[start] = 1;
    for (let head = 0; head < members.length; head++) {
      const cell = members[head];
      const row = Math.floor(cell / size);
      const col = cell % size;
      for (const [nextRow, nextCol] of [[row + 1, col], [row - 1, col], [row, col + 1], [row, col - 1]]) {
        if (nextRow < 0 || nextCol < 0 || nextRow >= size || nextCol >= size) continue;
        const next = nextRow * size + nextCol;
        if (!seen[next] && level[next] === level[start]) {
          seen[next] = 1;
          members.push(next);
        }
      }
    }
    for (const cell of members) area[cell] = members.length;
  }
  return area;
}

// Selective breaching (Lindsay 2016, Hydrol. Process. 30, 846): pits are shallowed to just below their lowest neighbour,
// the ground is flooded from the outlets in height order with a back-link per cell, and each pit's back-linked path is cut
// to fall monotonically to lower ground, only if the cut stays within the depth and length limits. Deeper pits stay and
// become lakes. Small pits held by thin rims on slopes drain, as hydrology tools prepare terrain.
const BREACH_MAX_DEPTH_METERS = 50; // inferred, TUNABLE (Lindsay gives no default)
const BREACH_MAX_LENGTH_CELLS = 20; // inferred, TUNABLE
const BREACH_STEP = 1e-7; // the small drop per cell along a cut, raw units (Lindsay: e.g. 0.0001 m)

function selectiveBreach(ground: Float32Array, isOutlet: Uint8Array, size: number, metersPerRaw: number, neighborStarts: Int32Array, neighborList: Int32Array, heap: NodeHeap): Float32Array {
  const cells = size * size;
  const out = ground.slice();
  const isPit = new Uint8Array(cells);
  for (let cell = 0; cell < cells; cell++) {
    if (isOutlet[cell]) continue;
    let lowest = Infinity;
    for (let k = neighborStarts[cell]; k < neighborStarts[cell + 1]; k++) lowest = Math.min(lowest, ground[neighborList[k]]);
    if (lowest >= ground[cell]) {
      isPit[cell] = 1;
      out[cell] = lowest - BREACH_STEP; // shallowing
    }
  }
  const maxDepth = BREACH_MAX_DEPTH_METERS / Math.max(metersPerRaw, 1e-9);
  const backLink = new Int32Array(cells).fill(-1);
  const visited = new Uint8Array(cells);
  heap.size = 0;
  for (let cell = 0; cell < cells; cell++) {
    if (isOutlet[cell]) {
      visited[cell] = 1;
      heap.push(cell, out[cell]);
    }
  }
  while (heap.size > 0) {
    const cell = heap.pop();
    for (let k = neighborStarts[cell]; k < neighborStarts[cell + 1]; k++) {
      const next = neighborList[k];
      if (visited[next]) continue;
      visited[next] = 1;
      backLink[next] = cell;
      heap.push(next, out[next]);
      if (!isPit[next]) continue;
      // Measure the cut first: along the back-links until a cell lower than the cutting level.
      let level = out[next];
      let depth = 0;
      let length = 0;
      for (let along = backLink[next]; along >= 0; along = backLink[along]) {
        level -= BREACH_STEP;
        if (out[along] <= level) break;
        depth = Math.max(depth, out[along] - level);
        length++;
        if (depth > maxDepth || length > BREACH_MAX_LENGTH_CELLS) break;
      }
      if (depth > maxDepth || length > BREACH_MAX_LENGTH_CELLS) continue;
      level = out[next];
      for (let along = backLink[next]; along >= 0; along = backLink[along]) {
        level -= BREACH_STEP;
        if (out[along] <= level) break;
        out[along] = level;
      }
    }
  }
  return out;
}

let neighbors: { size: number; neighborStarts: Int32Array; neighborList: Int32Array } | null = null;

self.onmessage = (event: MessageEvent<ChunkLakesRequest>) => {
  const { ground: rawGround, planetLakes, size, seaLevel, climate, chunkKm, radiusKm, metersPerRaw, requestId } = event.data;
  const start = performance.now();
  if (neighbors?.size !== size) neighbors = { size, ...squareNeighbors(size) };
  const { neighborStarts, neighborList } = neighbors;
  const cells = size * size;
  const isOcean = new Uint8Array(cells);
  // The cut sides are outlets, as the sea is: water drains through them instead of piling up against the cut.
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const cell = row * size + col;
      if (rawGround[cell] < seaLevel || row === 0 || col === 0 || row === size - 1 || col === size - 1) isOcean[cell] = 1;
    }
  }
  const heap = new NodeHeap(size * 64);
  const ground = selectiveBreach(rawGround, isOcean, size, metersPerRaw, neighborStarts, neighborList, heap);
  const hierarchy = buildDepressionHierarchy(ground, isOcean, neighborStarts, neighborList, heap);
  const lakes = fillSpillMerge(hierarchy, ground, neighborStarts, neighborList, waterBudget(climate).lakeShare, heap);
  // Each cell takes the higher of its own lake and the planet's lake flooded over this ground.
  const spill = spillHeights(ground, seaLevel, neighborStarts, neighborList, heap);
  const level = floodPlanetLakes(ground, planetLakes, spill, size, seaLevel);
  for (let cell = 0; cell < cells; cell++) {
    const lake = lakes.lakeOf[cell];
    if (lake >= 0 && lakes.lakeLevel[lake] > level[cell]) level[cell] = lakes.lakeLevel[lake];
  }
  // Four per cell: the level, the lake's share of the sea's tide (its width from its area on the chunk), and the spill
  // height: the sea shows only where the tide stands at or above it, so it never floods a dip it can't reach.
  const levels = new Float32Array(cells * 4);
  const area = lakeAreas(level, size);
  for (let cell = 0; cell < cells; cell++) {
    levels[cell * 4] = level[cell];
    if (level[cell] > NO_CHUNK_LAKE) levels[cell * 4 + 1] = Math.min(1, (LAKE_TIDE_BOOST * Math.sqrt(area[cell]) * (chunkKm / size)) / radiusKm);
    levels[cell * 4 + 2] = Math.min(spill[cell], SEA_NEVER_REACHES);
  }
  self.postMessage({ levels, requestId, lakeCount: lakes.lakeCount, ms: Math.round(performance.now() - start) }, { transfer: [levels.buffer] });
};
