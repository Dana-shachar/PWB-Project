import { RIVER_NO_LAKE, type RiverNetwork } from './riverTree';

// Every drawn river span, filed by place, so each patch bake measures its distance to rivers at its own resolution
// (Plate-Local River Generation; Derzapf 2011 refines rivers where the view needs them). Packed as RGBA texels read by
// index in heightmap.frag.glsl: buckets (first entry, count), then entries (a span's first texel), then spans.
export const RIVER_GRID_WIDTH = 2048;
export const RIVER_GRID_HEIGHT = 1024;
export const RIVER_MAX_BUCKET_PIECES = 48; // the shader's loop limit; a bucket keeps its widest spans first
export const RIVER_BLEND_WIDTH = 0.002; // radians past a river's edge over which the land blends to it (eq. 32's ω). Inferred, TUNABLE
export const RIVER_CURVE_STEPS = 4; // straight pieces per span. Inferred, TUNABLE
const RIVER_SPAN_TEXELS = RIVER_CURVE_STEPS + 2; // each point's xyz and level, then the half width at each end
const RIVER_SOURCE_WIDTH = 0.00015; // radians, half width where a river starts. Inferred, TUNABLE
const RIVER_MAX_WIDTH = 0.004;
const RIVER_WIDTH_EXPONENT = 0.345; // width grows as the square root of flow, and flow as area^0.69 (Peytavie et al. 2019)
export const RIVER_MIN_AREA = 256; // nodes of drainage area before a river is drawn: Peytavie et al. 2019's user threshold. TUNABLE
const NODE_SPACING = Math.PI / 2048; // radians between river nodes (riverGraph.ts)
// A mouth widens to the sea as an estuary, its width growing exponentially over a convergence length (Savenije 2005).
// Both values inferred, TUNABLE.
const ESTUARY_LENGTH = 4 * NODE_SPACING;
const ESTUARY_MOUTH_SCALE = 3; // the mouth's width over the river's
// Rivers begin in rounded hollows, not at a point (Montgomery and Dietrich 1988, "Where do channels begin?"): a source
// starts at this share of its width, so its head is round. Inferred, TUNABLE
const SOURCE_HEAD_SHARE = 0.6;
const ESTUARY_MIN_MOUTH = 0.5 * NODE_SPACING; // half width at the mouth however small the river, so every estuary shows
// A lake is water around each of its nodes, as Plate-Local River Generation's lake disks; reaching past the gap between
// neighbors, so a lake's disks join into one surface. Inferred, TUNABLE
const LAKE_NODE_RADIUS = 0.75 * NODE_SPACING;
// Rivers wind by a smooth noise offset across their path (Genevaux et al. 2013, 6.1: "positions and tangents ... randomly
// perturbed"; Plate-Local suggests "small deterministic noise offsets"). The wavelength is about 11 river widths (Leopold
// 1994), never under a few nodes; the amplitude stays below wavelength / 2π, so a bend can't fold back on itself.
const WIND_WIDTHS = 11;
const WIND_MIN_WAVELENGTH = 4 * NODE_SPACING; // Inferred, TUNABLE
const WIND_AMPLITUDE_SHARE = 0.8 / (2 * Math.PI); // of the wavelength. Inferred, TUNABLE

// Smooth 1D value noise, two octaves, in -1..1: the same seed and position always give the same offset.
function windNoise(seed: number, position: number): number {
  const hash = (cell: number) => {
    let value = Math.imul(cell ^ Math.imul(seed, 0x27d4eb2d), 0x165667b1) >>> 0;
    value = Math.imul(value ^ (value >>> 15), 0x85ebca6b) >>> 0;
    return (value / 4294967295) * 2 - 1;
  };
  const octave = (at: number) => {
    const cell = Math.floor(at);
    const t = at - cell;
    const ease = t * t * (3 - 2 * t);
    return hash(cell) + (hash(cell + 1) - hash(cell)) * ease;
  };
  return (octave(position) + 0.5 * octave(position * 2 + 17.3)) / 1.5;
}
// levels: each node's water level, from the terrain (valleyMap.ts).
export function buildRiverGrid(network: RiverNetwork, channelWidth: number, levels: Float32Array): { texels: Float32Array; maxBucketCount: number; overflowBuckets: number } {
  const { parents, flow, area, lakeOutlets, minDrawnFlow, nodeCount, order } = network;
  // A river is drawn once it has the flow and area, and from there all the way down: rivers don't vanish on their way to
  // the sea, even where a lake's evaporation leaves less water than the threshold. Lakes always count, so rivers run on
  // through them unbroken.
  const drawn = new Uint8Array(nodeCount);
  for (let idx = 0; idx < order.length; idx++) {
    const node = order[idx];
    if (lakeOutlets[node] !== RIVER_NO_LAKE || (parents[node] >= 0 && flow[node] >= minDrawnFlow && area[node] >= RIVER_MIN_AREA)) drawn[node] = 1;
    const parent = parents[node];
    if (drawn[node] && parent >= 0 && network.heights[parent] >= network.seaLevel) drawn[parent] = 1;
  }
  const spanNodes: number[] = [];
  for (let node = 0; node < nodeCount; node++) {
    if (!drawn[node]) continue;
    if (parents[node] < 0 && lakeOutlets[node] === RIVER_NO_LAKE) continue;
    spanNodes.push(node);
  }
  const spanCount = spanNodes.length;
  // A closed lake's nodes have no next node: their stretch is a single point, a disk of water.
  const nextOf = (node: number) => (parents[node] >= 0 ? parents[node] : node);
  const isLakeNode = (node: number) => lakeOutlets[node] !== RIVER_NO_LAKE;
  const isSpan = new Uint8Array(nodeCount);
  for (const node of spanNodes) isSpan[node] = 1;
  // Width from drainage area, as Peytavie's flow law does, so a river never narrows below a lake. Near the sea it widens into an
  // estuary over the last stretches.
  const toSea = new Float32Array(nodeCount).fill(Infinity);
  for (let idx = order.length - 1; idx >= 0; idx--) {
    const node = order[idx];
    const parent = parents[node];
    if (parent < 0) continue;
    const step = Math.hypot(network.positions[parent * 3] - network.positions[node * 3], network.positions[parent * 3 + 1] - network.positions[node * 3 + 1], network.positions[parent * 3 + 2] - network.positions[node * 3 + 2]);
    toSea[node] = network.heights[parent] < network.seaLevel ? step : toSea[parent] + step;
  }
  const widthAt = (node: number) => {
    const river = Math.min(RIVER_MAX_WIDTH, RIVER_SOURCE_WIDTH * channelWidth * Math.pow(Math.max(1, area[node] / RIVER_MIN_AREA), RIVER_WIDTH_EXPONENT));
    const estuary = Math.exp(-toSea[node] / ESTUARY_LENGTH);
    return Math.max(river * (1 + (ESTUARY_MOUTH_SCALE - 1) * estuary), ESTUARY_MIN_MOUTH * estuary);
  };
  const mainChild = new Int32Array(nodeCount).fill(-1);
  for (const node of spanNodes) {
    const parent = parents[node];
    if (parent < 0) continue;
    if (mainChild[parent] < 0 || flow[node] > flow[mainChild[parent]]) mainChild[parent] = node;
  }

  // The winding: each river node moves sideways by noise along its main stem, from its source down. Lakes, river ends
  // and the sea stay put, and a node's move is shared by every stretch touching it, so rivers stay joined.
  const positions = network.positions.slice();
  const along = new Float32Array(nodeCount);
  const stemSeed = new Int32Array(nodeCount);
  for (let idx = 0; idx < order.length; idx++) {
    const node = order[idx];
    if (!isSpan[node]) continue;
    if (mainChild[node] < 0) stemSeed[node] = node + 1;
    const parent = parents[node];
    if (parent < 0 || mainChild[parent] !== node) continue;
    const step = Math.hypot(positions[parent * 3] - positions[node * 3], positions[parent * 3 + 1] - positions[node * 3 + 1], positions[parent * 3 + 2] - positions[node * 3 + 2]);
    // The phase advances by distance over the local wavelength, so bends stay smooth as a river widens.
    along[parent] = along[node] + step / Math.max(WIND_MIN_WAVELENGTH, WIND_WIDTHS * 2 * widthAt(node));
    stemSeed[parent] = stemSeed[node];
  }
  for (const node of spanNodes) {
    const parent = parents[node];
    if (isLakeNode(node) || parent < 0 || !isSpan[parent]) continue;
    const x = network.positions[node * 3], y = network.positions[node * 3 + 1], z = network.positions[node * 3 + 2];
    const dirX = network.positions[parent * 3] - x, dirY = network.positions[parent * 3 + 1] - y, dirZ = network.positions[parent * 3 + 2] - z;
    let sideX = y * dirZ - z * dirY, sideY = z * dirX - x * dirZ, sideZ = x * dirY - y * dirX;
    const sideLen = Math.hypot(sideX, sideY, sideZ) || 1;
    const wavelength = Math.max(WIND_MIN_WAVELENGTH, WIND_WIDTHS * 2 * widthAt(node));
    const offset = (WIND_AMPLITUDE_SHARE * wavelength * windNoise(stemSeed[node], along[node])) / sideLen;
    sideX *= offset; sideY *= offset; sideZ *= offset;
    const movedX = x + sideX, movedY = y + sideY, movedZ = z + sideZ;
    const movedLen = Math.hypot(movedX, movedY, movedZ);
    positions[node * 3] = movedX / movedLen;
    positions[node * 3 + 1] = movedY / movedLen;
    positions[node * 3 + 2] = movedZ / movedLen;
  }
  // Points along each span: a Catmull-Rom curve through the main branch above, its ends and the node below (Peytavie
  // et al. 2019).
  const pointCount = RIVER_CURVE_STEPS + 1;
  const spanPoints = new Float32Array(spanCount * pointCount * 4);
  const point = [0, 0, 0];
  // A mouth's last stretch heads straight out along the river, not to the sea node beside it, which bent mouths into
  // hooks along the coast; it runs on past the coarse coast, so land the fine noise adds there is cut through. Inferred.
  const MOUTH_REACH = 3 * NODE_SPACING;
  const mouthEnd = [0, 0, 0];
  const mouthAfter = [0, 0, 0];
  function curvePoint(span: number, t: number): void {
    const node = spanNodes[span];
    const parent = nextOf(node);
    const before = mainChild[node] >= 0 ? mainChild[node] : node;
    const after = nextOf(parent);
    const isMouth = parent !== node && network.heights[parent] < network.seaLevel;
    if (isMouth) {
      let dirX = positions[node * 3] - positions[before * 3], dirY = positions[node * 3 + 1] - positions[before * 3 + 1], dirZ = positions[node * 3 + 2] - positions[before * 3 + 2];
      if (before === node) {
        dirX = positions[parent * 3] - positions[node * 3]; dirY = positions[parent * 3 + 1] - positions[node * 3 + 1]; dirZ = positions[parent * 3 + 2] - positions[node * 3 + 2];
      }
      const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
      for (const [axis, value] of [dirX, dirY, dirZ].entries()) {
        mouthEnd[axis] = positions[node * 3 + axis] + (value / dirLen) * MOUTH_REACH;
        mouthAfter[axis] = positions[node * 3 + axis] + (value / dirLen) * 2 * MOUTH_REACH;
      }
    }
    for (let axis = 0; axis < 3; axis++) {
      const p0 = positions[before * 3 + axis], p1 = positions[node * 3 + axis];
      const p2 = isMouth ? mouthEnd[axis] : positions[parent * 3 + axis];
      const p3 = isMouth ? mouthAfter[axis] : positions[after * 3 + axis];
      point[axis] = 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
    }
  }

  for (let i = 0; i < spanCount; i++) {
    const node = spanNodes[i];
    const parent = nextOf(node);
    for (let step = 0; step < pointCount; step++) {
      const t = step / RIVER_CURVE_STEPS;
      curvePoint(i, t);
      const at = (i * pointCount + step) * 4;
      let len = 0;
      for (let axis = 0; axis < 3; axis++) {
        spanPoints[at + axis] = point[axis];
        len += point[axis] * point[axis];
      }
      len = Math.sqrt(len);
      for (let axis = 0; axis < 3; axis++) spanPoints[at + axis] /= len;
      spanPoints[at + 3] = levels[node] + (levels[parent] - levels[node]) * t;
    }
  }
  const halfWidths = new Float32Array(spanCount);
  const startWidths = new Float32Array(spanCount);
  for (let i = 0; i < spanCount; i++) {
    const node = spanNodes[i];
    // A stretch carries its own node's water, so it ends at its own width, never the river or lake it flows into; it
    // starts at the width of the stretch above it, and a source narrows to a point.
    halfWidths[i] = isLakeNode(node) ? LAKE_NODE_RADIUS : widthAt(node);
    startWidths[i] = isLakeNode(node) ? LAKE_NODE_RADIUS : mainChild[node] >= 0 ? widthAt(mainChild[node]) : SOURCE_HEAD_SHARE * widthAt(node);
  }

  // Each span goes once in every bucket one of its pieces can reach: bounds narrow the search, then bucket centers are measured.
  const bucketCount = RIVER_GRID_WIDTH * RIVER_GRID_HEIGHT;
  const bucketLists: number[][] = new Array(bucketCount);
  const rowSize = Math.PI / RIVER_GRID_HEIGHT;
  const columnSize = (2 * Math.PI) / RIVER_GRID_WIDTH;
  let entryCount = 0;
  for (let i = 0; i < spanCount; i++) {
    const pad = halfWidths[i] + RIVER_BLEND_WIDTH;
    for (let step = 0; step < RIVER_CURVE_STEPS; step++) {
      const at = (i * pointCount + step) * 4;
      const startX = spanPoints[at], startY = spanPoints[at + 1], startZ = spanPoints[at + 2];
      const stepX = spanPoints[at + 4] - startX, stepY = spanPoints[at + 5] - startY, stepZ = spanPoints[at + 6] - startZ;
      const stepLenSq = Math.max(1e-12, stepX * stepX + stepY * stepY + stepZ * stepZ);
      const latA = Math.asin(Math.max(-1, Math.min(1, startY)));
      const latB = Math.asin(Math.max(-1, Math.min(1, startY + stepY)));
      const lonA = Math.atan2(startZ, startX);
      let lonB = Math.atan2(startZ + stepZ, startX + stepX);
      if (lonB - lonA > Math.PI) lonB -= 2 * Math.PI;
      else if (lonA - lonB > Math.PI) lonB += 2 * Math.PI;
      const firstRow = Math.max(0, Math.floor((Math.min(latA, latB) - pad + Math.PI / 2) / rowSize));
      const lastRow = Math.min(RIVER_GRID_HEIGHT - 1, Math.floor((Math.max(latA, latB) + pad + Math.PI / 2) / rowSize));
      const lonPad = pad / Math.max(0.02, Math.min(Math.cos(latA), Math.cos(latB)) - pad);
      const firstColumn = Math.floor((Math.min(lonA, lonB) - lonPad + Math.PI) / columnSize);
      const lastColumn = Math.min(firstColumn + RIVER_GRID_WIDTH - 1, Math.floor((Math.max(lonA, lonB) + lonPad + Math.PI) / columnSize));
      for (let row = firstRow; row <= lastRow; row++) {
        const rowLat = (row + 0.5) * rowSize - Math.PI / 2;
        const rowCos = Math.cos(rowLat), rowSin = Math.sin(rowLat);
        const halfDiagonal = 0.5 * Math.hypot(rowSize, columnSize * Math.cos(Math.max(0, Math.abs(rowLat) - rowSize / 2)));
        const limitSq = (pad + halfDiagonal) * (pad + halfDiagonal);
        for (let column = firstColumn; column <= lastColumn; column++) {
          const lon = (column + 0.5) * columnSize - Math.PI;
          const pointX = rowCos * Math.cos(lon), pointZ = rowCos * Math.sin(lon);
          const share = Math.max(0, Math.min(1, ((pointX - startX) * stepX + (rowSin - startY) * stepY + (pointZ - startZ) * stepZ) / stepLenSq));
          const gapX = pointX - startX - share * stepX, gapY = rowSin - startY - share * stepY, gapZ = pointZ - startZ - share * stepZ;
          if (gapX * gapX + gapY * gapY + gapZ * gapZ > limitSq) continue;
          const bucket = row * RIVER_GRID_WIDTH + ((column % RIVER_GRID_WIDTH) + RIVER_GRID_WIDTH) % RIVER_GRID_WIDTH;
          const list = (bucketLists[bucket] ??= []);
          if (list[list.length - 1] === i) continue; // already filed from an earlier piece of this span
          list.push(i);
          entryCount++;
        }
      }
    }
  }

  const spanStart = bucketCount + entryCount;
  const texels = new Float32Array((spanStart + spanCount * RIVER_SPAN_TEXELS) * 4);
  let entry = bucketCount;
  let maxBucketCount = 0;
  let overflowBuckets = 0;
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const list = bucketLists[bucket];
    if (!list) continue;
    list.sort((first, second) => halfWidths[second] - halfWidths[first]);
    texels[bucket * 4] = entry;
    texels[bucket * 4 + 1] = list.length;
    maxBucketCount = Math.max(maxBucketCount, list.length);
    if (list.length > RIVER_MAX_BUCKET_PIECES) overflowBuckets++;
    for (const span of list) texels[entry++ * 4] = spanStart + span * RIVER_SPAN_TEXELS;
  }
  for (let i = 0; i < spanCount; i++) {
    const at = (spanStart + i * RIVER_SPAN_TEXELS) * 4;
    texels.set(spanPoints.subarray(i * pointCount * 4, (i + 1) * pointCount * 4), at);
    texels[at + pointCount * 4] = startWidths[i];
    texels[at + pointCount * 4 + 1] = halfWidths[i];
  }
  return { texels, maxBucketCount, overflowBuckets };
}
