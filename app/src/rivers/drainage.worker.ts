// The planet water's CPU work, off the main thread: the pit fill before the GPU passes, then lakes, river cells and the
// checks on the result. Lakes come from the climate: the depression hierarchy (Barnes, Callaghan and Wickert 2020) of
// the plain terrain, filled by Fill-Spill-Merge (same authors 2021) with the water Rainfall and Temperature leave
// (rivers/riverClimate.ts, waterBudget). A climate change refills the cached hierarchy only.
import { buildDepressionHierarchy, fillSpillMerge, type DepressionHierarchy } from './depressions';
import { fillPits, NodeHeap } from './pitFill';
import { waterBudget, type RiverClimate } from './riverClimate';
import { buildRiverGrid, type RiverNodes } from './riverGrid';

// A river is a cell draining at least this many cells (Peytavie et al. 2019: a user-set threshold). Inferred, TUNABLE
const RIVER_MIN_CELLS = 300;
// Rivers widen and deepen with their flow downstream: width as Q^0.5 and depth as Q^0.4 (Leopold and Maddock 1953, USGS
// Professional Paper 252), with Q = 0.42 A^0.69 from drainage area (Peytavie et al. 2019, after Dunne) times the
// climate's runoff (waterBudget's flowScale). The sizes at the drawing threshold are inferred, TUNABLE.
const RIVER_HALF_WIDTH_AT_THRESHOLD = 0.00015; // radians, about 0.9 km on a 6,000 km planet
const RIVER_MAX_HALF_WIDTH = 0.004;
const RIVER_DEPTH_AT_THRESHOLD = 0.001; // globe map units
const FLOW_EXPONENT = 0.69;

// The river network: every river cell drains to its steepest lower neighbor on the ground, so rivers only run downhill,
// and each river's water level is made to descend all the way (Plate-Local River Generation). Rows run north to south.
function extractRiverNodes(kind: Uint8Array, drainageCells: Float32Array, ground: Float32Array, lakeLevel: Float32Array, width: number, height: number, seaLevel: number, flowScale: number): RiverNodes {
  const nodeOf = new Int32Array(kind.length).fill(-1);
  const cellOf: number[] = [];
  const addNode = (cell: number) => {
    if (nodeOf[cell] < 0) {
      nodeOf[cell] = cellOf.length;
      cellOf.push(cell);
    }
    return nodeOf[cell];
  };
  const parentCell = new Int32Array(kind.length).fill(-1);
  for (let cell = 0; cell < kind.length; cell++) {
    if (kind[cell] !== 3) continue;
    addNode(cell);
    const row = Math.floor(cell / width);
    const col = cell - row * width;
    const cosLat = Math.max(1e-3, Math.cos((0.5 - (row + 0.5) / height) * Math.PI));
    let best = -1;
    let bestSlope = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const nextRow = row + dy;
      if (nextRow < 0 || nextRow >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const next = nextRow * width + ((col + dx + width) % width);
        const slope = (ground[cell] - ground[next]) / Math.hypot(dx * cosLat, dy);
        if (slope > bestSlope) { bestSlope = slope; best = next; }
      }
    }
    parentCell[cell] = best;
    if (best >= 0) addNode(best);
  }
  const count = cellOf.length;
  const positions = new Float32Array(count * 3);
  const parents = new Int32Array(count).fill(-1);
  const levels = new Float32Array(count);
  const halfWidths = new Float32Array(count);
  const depths = new Float32Array(count);
  const isSpan = new Uint8Array(count);
  const flow = new Float32Array(count);
  for (let node = 0; node < count; node++) {
    const cell = cellOf[node];
    const row = Math.floor(cell / width);
    const col = cell - row * width;
    const lat = (0.5 - (row + 0.5) / height) * Math.PI;
    const lon = ((col + 0.5) / width) * 2 * Math.PI - Math.PI;
    positions[node * 3] = Math.cos(lat) * Math.cos(lon);
    positions[node * 3 + 1] = Math.sin(lat);
    positions[node * 3 + 2] = Math.cos(lat) * Math.sin(lon);
    levels[node] = kind[cell] === 1 ? seaLevel : kind[cell] === 2 ? lakeLevel[cell] : ground[cell];
    flow[node] = drainageCells[cell];
    const relativeFlow = Math.pow(Math.max(1, drainageCells[cell] / RIVER_MIN_CELLS), FLOW_EXPONENT) * Math.max(flowScale, 0.01);
    halfWidths[node] = Math.min(RIVER_MAX_HALF_WIDTH, RIVER_HALF_WIDTH_AT_THRESHOLD * Math.sqrt(relativeFlow));
    depths[node] = RIVER_DEPTH_AT_THRESHOLD * Math.pow(relativeFlow, 0.4);
    if (kind[cell] === 3 && parentCell[cell] >= 0) {
      parents[node] = nodeOf[parentCell[cell]];
      isSpan[node] = 1;
    }
  }
  // Levels descend: from the highest river node down, each one's water can't stand below the next one's.
  const order = Array.from({ length: count }, (_, node) => node).filter((node) => isSpan[node]).sort((first, second) => levels[second] - levels[first]);
  for (const node of order) {
    const parent = parents[node];
    if (levels[parent] > levels[node]) levels[parent] = levels[node];
  }
  return { count, positions, parents, levels, halfWidths, depths, isSpan, flow };
}

// Each cell's 8 neighbors on the globe grid, wrapping east to west, as the flat lists depressions.ts walks.
function gridNeighbors(width: number, height: number): { neighborStarts: Int32Array; neighborList: Int32Array } {
  const neighborStarts = new Int32Array(width * height + 1);
  const neighborList = new Int32Array(width * height * 8);
  let count = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      neighborStarts[row * width + col] = count;
      for (let dy = -1; dy <= 1; dy++) {
        const nextRow = row + dy;
        if (nextRow < 0 || nextRow >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx !== 0 || dy !== 0) neighborList[count++] = nextRow * width + ((col + dx + width) % width);
        }
      }
    }
  }
  neighborStarts[width * height] = count;
  return { neighborStarts, neighborList: neighborList.subarray(0, count) };
}

// The land's typical distance between valleys, in meters: twice the mean distance from a land cell to its nearest river
// cell, by a two-pass chamfer sweep (east-west wrap and latitude ignored). It stands in for the mountain width that sets
// the erosion filter's scale (bevy_erosion_filter: "mountain width / 5..10"). Inferred
function valleySpacingMeters(kind: Uint8Array, width: number, height: number, cellMeters: number): number {
  const far = 1e9;
  const dist = new Float32Array(kind.length);
  for (let cell = 0; cell < kind.length; cell++) dist[cell] = kind[cell] === 3 ? 0 : far;
  const diagonal = Math.SQRT2;
  const relax = (cell: number, row: number, col: number, dy: number, dx: number, cost: number) => {
    const nextRow = row + dy;
    const nextCol = col + dx;
    if (nextRow < 0 || nextRow >= height || nextCol < 0 || nextCol >= width) return;
    const through = dist[nextRow * width + nextCol] + cost;
    if (through < dist[cell]) dist[cell] = through;
  };
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const cell = row * width + col;
      relax(cell, row, col, -1, -1, diagonal);
      relax(cell, row, col, -1, 0, 1);
      relax(cell, row, col, -1, 1, diagonal);
      relax(cell, row, col, 0, -1, 1);
    }
  }
  for (let row = height - 1; row >= 0; row--) {
    for (let col = width - 1; col >= 0; col--) {
      const cell = row * width + col;
      relax(cell, row, col, 1, 1, diagonal);
      relax(cell, row, col, 1, 0, 1);
      relax(cell, row, col, 1, -1, diagonal);
      relax(cell, row, col, 0, 1, 1);
    }
  }
  let sum = 0;
  let count = 0;
  for (let cell = 0; cell < kind.length; cell++) {
    if ((kind[cell] === 0 || kind[cell] === 3) && dist[cell] < far) {
      sum += dist[cell];
      count++;
    }
  }
  return count > 0 ? (2 * sum / count) * cellMeters : 0;
}

let original: Float32Array | null = null;
let filled: Float32Array | null = null;
// Cached per terrain: the grid's neighbors (per size) and the hierarchy of the plain terrain's depressions.
let neighbors: { width: number; height: number; neighborStarts: Int32Array; neighborList: Int32Array } | null = null;
let hierarchy: DepressionHierarchy | null = null;
// The last GPU result, so a climate change rebuilds the water map without a rerun.
let lastRun: { eroded: Float32Array; drainage: Float32Array; width: number; height: number; seaLevel: number; cellDiagonal: number; metersPerUnit: number } | null = null;
let climate: RiverClimate | null = null;

self.onmessage = (event: MessageEvent) => {
  const message = event.data;
  if (message.type === 'fill') {
    const start = performance.now();
    original = message.heights as Float32Array;
    filled = fillPits(original, message.width, message.height, message.seaLevel);
    hierarchy = null;
    lastRun = null;
    const copy = filled.slice();
    const settled = accumulateDrainage(filled, message.width, message.height, message.seaLevel);
    self.postMessage({ type: 'filled', filled: copy, drainage: settled, width: message.width, height: message.height, ms: Math.round(performance.now() - start), requestId: message.requestId }, { transfer: [copy.buffer, settled.buffer] });
    return;
  }
  if (message.type === 'climate') {
    climate = message.climate as RiverClimate;
    if (lastRun) buildWaterMap(message.requestId);
    return;
  }
  if (message.type === 'analyze' && original && filled) {
    const { eroded, drainage, width, height, seaLevel, cellDiagonal, metersPerUnit } = message;
    climate = message.climate as RiverClimate;
    lastRun = { eroded, drainage, width, height, seaLevel, cellDiagonal, metersPerUnit };
    hierarchy = null; // a new erosion result: its carved rims change the basins
    buildWaterMap(message.requestId);
  }
};

// Lakes from the climate, river cells, the checks, and the bake's water map.
function buildWaterMap(requestId: number): void {
  if (!original || !filled || !lastRun || !climate) return;
  const start = performance.now();
  const { eroded, drainage, width, height, seaLevel, cellDiagonal, metersPerUnit } = lastRun;
  const cells = width * height;
  if (neighbors?.width !== width || neighbors?.height !== height) neighbors = { width, height, ...gridNeighbors(width, height) };
  const { neighborStarts, neighborList } = neighbors;
  const isOcean = new Uint8Array(cells);
  for (let cell = 0; cell < cells; cell++) if (original[cell] < seaLevel) isOcean[cell] = 1;
  const heap = new NodeHeap(width * 64);
  // The ground: the plain terrain plus the erosion's carving, so carved rims let basins drain (Braun and Willett 2013,
  // section 6: sills erode as discharge passes them). Lakes, the bake's lakes and the erosion filter all use it.
  const ground = new Float32Array(cells);
  for (let cell = 0; cell < cells; cell++) ground[cell] = isOcean[cell] ? original[cell] : original[cell] + eroded[cell] / metersPerUnit + seaLevel - filled[cell];
  hierarchy ??= buildDepressionHierarchy(ground, isOcean, neighborStarts, neighborList, heap);
  const budget = waterBudget(climate);
  const lakes = fillSpillMerge(hierarchy, ground, neighborStarts, neighborList, budget.lakeShare, heap);
  const riverMin = RIVER_MIN_CELLS * cellDiagonal;
  // 0 land, 1 ocean, 2 lake, 3 river
  const kind = new Uint8Array(cells);
  for (let cell = 0; cell < cells; cell++) {
    if (isOcean[cell]) kind[cell] = 1;
    else if (lakes.lakeOf[cell] >= 0) kind[cell] = 2;
    else if (drainage[cell] > riverMin) kind[cell] = 3;
  }

  // Checks: a river cell with no lower neighbor that isn't water is a dead end; a lake beside the ocean is a mistake.
  let riverCells = 0;
  let deadEnds = 0;
  let lakeCells = 0;
  let lakesTouchingOcean = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const cell = row * width + col;
      if (kind[cell] !== 2 && kind[cell] !== 3) continue;
      let lower = false;
      let water = false;
      let ocean = false;
      for (let dy = -1; dy <= 1; dy++) {
        const nextRow = row + dy;
        if (nextRow < 0 || nextRow >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const next = nextRow * width + ((col + dx + width) % width);
          if (eroded[next] < eroded[cell]) lower = true;
          if (kind[next] === 1 || kind[next] === 2) water = true;
          if (kind[next] === 1) ocean = true;
        }
      }
      if (kind[cell] === 3) {
        riverCells++;
        if (!lower && !water) deadEnds++;
      } else {
        lakeCells++;
        if (ocean) lakesTouchingOcean++;
      }
    }
  }

  // The bake's map (map/heightmap.ts, setPlanetWaterMap): R = the erosion's carving in the globe map's units, G = drainage
  // in cells, B = a lake's level over its whole basin and the ground elsewhere, A = 1 in a lake's basin. The bake draws
  // water per point where B stands above the ground, so shores follow the terrain (Cordonnier et al. 2016, 6.2).
  // The map's rows go south first, as the bake's uv runs (spherePositionToPaintUv), then the river grid's texels after them.
  const drainageCells = new Float32Array(cells);
  for (let cell = 0; cell < cells; cell++) drainageCells[cell] = drainage[cell] / cellDiagonal;
  const lakeLevel = new Float32Array(cells);
  for (let cell = 0; cell < cells; cell++) lakeLevel[cell] = Number.isNaN(lakes.catchmentLevel[cell]) ? ground[cell] : lakes.catchmentLevel[cell];
  const rivers = buildRiverGrid(extractRiverNodes(kind, drainageCells, ground, lakeLevel, width, height, seaLevel, budget.flowScale));
  const gridRows = Math.ceil(rivers.texels.length / 4 / width);
  const totalRows = height + gridRows;
  const waterMap = new Float32Array(width * totalRows * 4);
  waterMap.set(rivers.texels, width * height * 4);
  for (let cell = 0; cell < cells; cell++) {
    const row = Math.floor(cell / width);
    const out = ((height - 1 - row) * width + (cell - row * width)) * 4;
    waterMap[out] = kind[cell] === 1 ? 0 : eroded[cell] / metersPerUnit + seaLevel - filled[cell];
    waterMap[out + 1] = drainageCells[cell];
    waterMap[out + 2] = ground[cell];
    waterMap[out + 3] = lakeLevel[cell];
  }
  const valleySpacing = valleySpacingMeters(kind, width, height, cellDiagonal / Math.SQRT2);
  self.postMessage({ type: 'analyzed', requestId, waterMap, valleySpacing, width, height, totalRows, riverCells, deadEnds, lakeCells, lakesTouchingOcean, ms: Math.round(performance.now() - start) }, { transfer: [waterMap.buffer] });
}

// The settled drainage of the planet's stream power pass (shaders/erosion/streamPowerPlanet.frag.glsl) in one sweep
// instead of hundreds of GPU passes: flow accumulation (O'Callaghan and Mark 1984) with the pass's own multiple-flow split
// (Freeman 1991, slope to the power SCHOTT_FLOW_EXPONENT), each cell visited only after every cell draining into it (a
// topological order, as Braun and Willett 2013's stack). Same geometry as the pass: the map wraps east to west, east-west
// distances shrink with latitude (measured at the receiving cell), cells below the base level are ocean and pass nothing
// on. Planet radius 1: drainage grows linearly with cell size, so the seed scales it by the radius.
const SCHOTT_FLOW_EXPONENT = 1; // rivers/planetDrainage.ts
const NEIGHBOR_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const NEIGHBOR_DY = [1, 1, 0, -1, -1, -1, 0, 1];
export function accumulateDrainage(heights: Float32Array, width: number, height: number, baseLevel: number): Float32Array {
  const cells = width * height;
  const cellX = (2 * Math.PI) / width;
  const cellY = Math.PI / height;
  const cosLat = new Float32Array(height);
  for (let y = 0; y < height; y++) cosLat[y] = Math.max(Math.cos(((y + 0.5) / height - 0.5) * Math.PI), 1e-3);
  const isOcean = (cell: number) => heights[cell] < baseLevel;
  const shares = new Float32Array(8);
  const targets = new Int32Array(8);
  // The water split from one land cell to its lower neighbours, as flowCoeff; returns how many receive.
  function split(cell: number): number {
    const x = cell % width;
    const y = (cell - x) / width;
    let count = 0;
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      const ny = y + NEIGHBOR_DY[i];
      if (ny < 0 || ny >= height) continue;
      const nx = (x + NEIGHBOR_DX[i] + width) % width;
      const next = ny * width + nx;
      const distance = Math.hypot(NEIGHBOR_DX[i] * cellX * cosLat[ny], NEIGHBOR_DY[i] * cellY);
      const slope = (heights[cell] - heights[next]) / distance;
      if (slope <= 0) continue;
      const weight = SCHOTT_FLOW_EXPONENT === 1 ? slope : Math.pow(slope, SCHOTT_FLOW_EXPONENT);
      shares[count] = weight;
      targets[count] = next;
      sum += weight;
      count++;
    }
    for (let k = 0; k < count; k++) shares[k] /= sum;
    return count;
  }
  const donors = new Uint8Array(cells);
  for (let cell = 0; cell < cells; cell++) {
    if (isOcean(cell)) continue;
    const count = split(cell);
    for (let k = 0; k < count; k++) donors[targets[k]]++;
  }
  const drainage = new Float32Array(cells);
  for (let cell = 0; cell < cells; cell++) {
    if (isOcean(cell)) continue;
    const y = Math.floor(cell / width);
    drainage[cell] = Math.hypot(cellX * cosLat[y], cellY); // the pass's cellArea
  }
  const queue = new Int32Array(cells);
  let tail = 0;
  for (let cell = 0; cell < cells; cell++) if (donors[cell] === 0) queue[tail++] = cell;
  for (let head = 0; head < tail; head++) {
    const cell = queue[head];
    if (isOcean(cell)) continue; // the ocean passes no water on
    const count = split(cell);
    for (let k = 0; k < count; k++) {
      const next = targets[k];
      drainage[next] += drainage[cell] * shares[k];
      if (--donors[next] === 0) queue[tail++] = next;
    }
  }
  return drainage;
}
