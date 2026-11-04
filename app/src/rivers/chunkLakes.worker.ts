// The land chunk's lakes, solved on the chunk's own ground: the planet's depression hierarchy and Fill-Spill-Merge with the
// climate's lakeShare, so a lake can never stand above its rim.
import { buildDepressionHierarchy, fillSpillMerge } from './depressions';
import { NodeHeap } from './pitFill';
import { waterBudget, type RiverClimate } from './riverClimate';

export const NO_CHUNK_LAKE = -1000;
// A lake's tide is the sea's times its width over the planet's radius (Lake Superior: about 0.09, so about 4 cm, within
// NOAA's "less than five centimeters"), raised so large lakes show a subtle shift. Inferred, TUNABLE.
const LAKE_TIDE_BOOST = 4;

export interface ChunkLakesRequest {
  ground: Float32Array;
  size: number;
  seaLevel: number;
  climate: RiverClimate;
  chunkKm: number;
  radiusKm: number;
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

let neighbors: { size: number; neighborStarts: Int32Array; neighborList: Int32Array } | null = null;

self.onmessage = (event: MessageEvent<ChunkLakesRequest>) => {
  const { ground, size, seaLevel, climate, chunkKm, radiusKm, requestId } = event.data;
  const start = performance.now();
  if (neighbors?.size !== size) neighbors = { size, ...squareNeighbors(size) };
  const { neighborStarts, neighborList } = neighbors;
  const cells = size * size;
  const isOcean = new Uint8Array(cells);
  // The cut sides are outlets, as the sea is: water drains through them instead of piling up against the cut.
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const cell = row * size + col;
      if (ground[cell] < seaLevel || row === 0 || col === 0 || row === size - 1 || col === size - 1) isOcean[cell] = 1;
    }
  }
  const heap = new NodeHeap(size * 64);
  const hierarchy = buildDepressionHierarchy(ground, isOcean, neighborStarts, neighborList, heap);
  const lakes = fillSpillMerge(hierarchy, ground, neighborStarts, neighborList, waterBudget(climate).lakeShare, heap);
  const lakeCells = new Int32Array(lakes.lakeCount);
  for (let cell = 0; cell < cells; cell++) if (lakes.lakeOf[cell] >= 0) lakeCells[lakes.lakeOf[cell]]++;
  // Pairs per cell: the level, and how much of the sea's tide the lake takes.
  const levels = new Float32Array(cells * 2);
  for (let cell = 0; cell < cells; cell++) {
    const lake = lakes.lakeOf[cell];
    levels[cell * 2] = lake >= 0 ? lakes.lakeLevel[lake] : NO_CHUNK_LAKE;
    if (lake >= 0) levels[cell * 2 + 1] = Math.min(1, (LAKE_TIDE_BOOST * Math.sqrt(lakeCells[lake]) * (chunkKm / size)) / radiusKm);
  }
  self.postMessage({ levels, requestId, lakeCount: lakes.lakeCount, ms: Math.round(performance.now() - start) }, { transfer: [levels.buffer] });
};
