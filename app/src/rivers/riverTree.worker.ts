import { liquidNamed, type RiverClimate } from './riverClimate';
import { erodeTerrain } from './streamPower';
import { buildRiverGraph, type RiverGraph } from './riverGraph';
import { RIVER_MIN_AREA } from './riverGrid';
import { buildValleyMap, VALLEY_MAP_HEIGHT, VALLEY_MAP_WIDTH } from './valleyMap';
import { applyClimate, buildRiverTree, extractLakeNodes, extractRiverSegments, queryRiverSegments, smoothRiverPaths, type RiverNetwork, type RiverTree } from './riverTree';
import type { RiverQuery } from './riverView';

type RiverMessage =
  | { type: 'build'; heights: Float32Array; width: number; height: number; seaLevel: number; climate: RiverClimate; requestId: number }
  | { type: 'climate'; climate: RiverClimate; requestId: number }
  | { type: 'valley'; erosionStrength: number }
  | { type: 'query'; query: RiverQuery; queryId: number };

// The tree runs off the main thread and stays here: only the segments in view ever reach the app.
let tree: RiverTree | null = null;
let segments: Float32Array = new Float32Array(0);
let latest: { network: RiverNetwork; climate: RiverClimate } | null = null;

// The nodes' neighbors depend only on the map's size, so they're built once, as soon as the worker starts. Messages
// that arrive meanwhile wait in the queue.
const graphStartMs = performance.now();
let graph: RiverGraph = buildRiverGraph(VALLEY_MAP_WIDTH, VALLEY_MAP_HEIGHT);
self.postMessage({ type: 'graphReady', ms: Math.round(performance.now() - graphStartMs) });

// [TEMP rivers] where each lake's water goes: follows the outlet down and sorts it by whether it reaches the sea, and
// whether every step on the way is drawn (enough flow and area to be a river).
function lakeOutflows(network: RiverNetwork): Record<string, number> {
  const { parents, flow, area, lakeOutlets, minDrawnFlow, nodeCount } = network;
  const outlets = new Set<number>();
  for (let node = 0; node < nodeCount; node++) if (lakeOutlets[node] >= 0) outlets.add(lakeOutlets[node]);
  const result = { lakes: outlets.size, closed: 0, seaDrawnAllTheWay: 0, seaWithUndrawnGap: 0, gapByFlow: 0, gapByArea: 0, other: 0 };
  for (const outlet of outlets) {
    let node = outlet;
    let gap = false;
    let steps = 0;
    while (steps++ < 200000) {
      const parent = parents[node];
      if (parent === -3) { result.closed++; break; } // LAKE_END
      if (parent < 0) { // a sea node: the water arrived
        if (gap) result.seaWithUndrawnGap++; else result.seaDrawnAllTheWay++;
        break;
      }
      if (lakeOutlets[node] < 0) {
        if (flow[node] < minDrawnFlow) { if (!gap) result.gapByFlow++; gap = true; }
        else if (area[node] < RIVER_MIN_AREA) { if (!gap) result.gapByArea++; gap = true; }
      }
      node = parent;
    }
    if (steps >= 200000) result.other++;
  }
  return result;
}

// [TEMP rivers] share of drawn river steps within 5 degrees of the old grid's 8 directions: about 22% if directions
// are spread evenly, near 100% on a grid.
function gridAlignedShare(network: RiverNetwork): number {
  const { positions, parents, flow, minDrawnFlow, nodeCount } = network;
  let aligned = 0;
  let total = 0;
  for (let node = 0; node < nodeCount; node++) {
    const parent = parents[node];
    if (parent < 0 || flow[node] < minDrawnFlow) continue;
    const x = positions[node * 3], y = positions[node * 3 + 1], z = positions[node * 3 + 2];
    const eastLen = Math.hypot(z, x) || 1;
    const eastX = -z / eastLen, eastZ = x / eastLen; // east is up × position, flattened
    const northX = y * eastZ, northY = z * eastX - x * eastZ, northZ = -y * eastX; // position × east
    const dx = positions[parent * 3] - x, dy = positions[parent * 3 + 1] - y, dz = positions[parent * 3 + 2] - z;
    const degrees = (Math.atan2(dx * northX + dy * northY + dz * northZ, dx * eastX + dz * eastZ) * 180) / Math.PI;
    const offset = ((degrees % 45) + 45) % 45;
    if (Math.min(offset, 45 - offset) <= 5) aligned++;
    total++;
  }
  return total ? aligned / total : 0;
}

function applyAndReport(climate: RiverClimate, requestId: number): void {
  if (!tree) return;
  const network = applyClimate(tree, climate);
  latest = { network, climate };
  erodeTerrain(network);
  const alignedShare = gridAlignedShare(network);
  console.log('[TEMP rivers] lake outflows', JSON.stringify(lakeOutflows(network)));
  // [TEMP rivers] river systems reaching the sea that are big enough to draw, and the largest basin, in nodes.
  let drawnSystems = 0;
  let largestBasin = 0;
  for (let node = 0; node < network.nodeCount; node++) {
    const parent = network.parents[node];
    if (parent < 0 || network.parents[parent] !== -2 || network.heights[parent] >= network.seaLevel) continue;
    if (network.area[node] >= RIVER_MIN_AREA) drawnSystems++;
    largestBasin = Math.max(largestBasin, network.area[node]);
  }
  console.log('[TEMP rivers] basins', JSON.stringify({ drawnSystems, largestBasin: Math.round(largestBasin) }));
  smoothRiverPaths(network);
  segments = extractRiverSegments(network);
  const lakeNodes = extractLakeNodes(network);
  const summary = { climate, lakeDots: lakeNodes.length / 4, nodes: network.nodeCount, mouths: network.mouthCount, pits: network.pitCount, closedLakes: network.closedLakes, spillingLakes: network.spillingLakes, lakeLandShare: network.lakeLandShare, largestLake: network.largestLake, storedBytes: segments.byteLength, alignedShare };
  self.postMessage({ type: 'built', requestId, ...summary, lakeNodes }, { transfer: [lakeNodes.buffer] });
}

self.onmessage = (event: MessageEvent<RiverMessage>) => {
  const message = event.data;
  if (message.type === 'build') {
    if (graph.width !== message.width || graph.height !== message.height) graph = buildRiverGraph(message.width, message.height);
    tree = buildRiverTree(message.heights, message.seaLevel, graph);
    applyAndReport(message.climate, message.requestId);
    return;
  }
  if (message.type === 'climate') {
    applyAndReport(message.climate, message.requestId);
    return;
  }
  if (message.type === 'valley') {
    if (!latest) return;
    const startMs = performance.now();
    const { map, maxBucketCount, overflowBuckets } = buildValleyMap(latest.network, liquidNamed(latest.climate.liquid).channelWidth, message.erosionStrength);
    self.postMessage({ type: 'valley', map, maxBucketCount, overflowBuckets, ms: Math.round(performance.now() - startMs) }, { transfer: [map.buffer] });
    return;
  }
  const visible = queryRiverSegments(segments, message.query);
  self.postMessage({ type: 'segments', queryId: message.queryId, segments: visible }, { transfer: [visible.buffer] });
};
