import { liquidNamed, type RiverClimate } from './riverClimate';
import { erodeTerrain } from './streamPower';
import { buildValleyMap } from './valleyMap';
import { applyClimate, buildRiverTree, extractLakeNodes, extractRiverSegments, queryRiverSegments, smoothRiverPaths, type RiverNetwork, type RiverTree } from './riverTree';
import type { RiverQuery } from './riverView';

type RiverMessage =
  | { type: 'build'; heights: Float32Array; width: number; height: number; seaLevel: number; climate: RiverClimate; requestId: number }
  | { type: 'climate'; climate: RiverClimate; requestId: number }
  | { type: 'valley' }
  | { type: 'query'; query: RiverQuery; queryId: number };

// The tree runs off the main thread and stays here: only the segments in view ever reach the app.
let tree: RiverTree | null = null;
let segments: Float32Array = new Float32Array(0);
let latest: { network: RiverNetwork; climate: RiverClimate } | null = null;

function applyAndReport(climate: RiverClimate, requestId: number): void {
  if (!tree) return;
  const network = applyClimate(tree, climate);
  latest = { network, climate };
  erodeTerrain(network);
  smoothRiverPaths(network);
  segments = extractRiverSegments(network);
  const lakeNodes = extractLakeNodes(network);
  const summary = { climate, lakeDots: lakeNodes.length / 4, nodes: network.nodeCount, mouths: network.mouthCount, pits: network.pitCount, closedLakes: network.closedLakes, spillingLakes: network.spillingLakes, lakeLandShare: network.lakeLandShare, largestLake: network.largestLake, storedBytes: segments.byteLength };
  self.postMessage({ type: 'built', requestId, ...summary, lakeNodes }, { transfer: [lakeNodes.buffer] });
}

self.onmessage = (event: MessageEvent<RiverMessage>) => {
  const message = event.data;
  if (message.type === 'build') {
    tree = buildRiverTree(message.heights, message.width, message.height, message.seaLevel);
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
    const map = buildValleyMap(latest.network, liquidNamed(latest.climate.liquid).channelWidth);
    self.postMessage({ type: 'valley', map, ms: Math.round(performance.now() - startMs) }, { transfer: [map.buffer] });
    return;
  }
  const visible = queryRiverSegments(segments, message.query);
  self.postMessage({ type: 'segments', queryId: message.queryId, segments: visible }, { transfer: [visible.buffer] });
};
