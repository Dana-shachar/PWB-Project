// A river network on the planet's existing terrain. The tree of Sapiens (David Frampton, r/proceduralgeneration): nodes
// jittered per cell, grown from the sea, flow summed from the springs. Growing lower ground first (inferred, TUNABLE)
// makes it follow the valleys, and gives every land node a route to the sea with no dead ends. Pits are filled to their
// rims first (Priority-Flood, as Peytavie et al. 2019 do), so water at every node has its own height, like a local sea.

import { waterBudget, type RiverClimate, type WaterBudget } from './riverClimate';
import type { RiverGraph } from './riverGraph';

export const NOT_LAND = -2; // sea nodes, which have no parent: every river ends in one, as in Sapiens and Davis
const NO_LAKE = -1;
export const RIVER_NO_LAKE = NO_LAKE;
const LAKE_END = -3; // a closed lake's nodes, which have no parent: its rivers end there

export interface RiverNetwork {
  positions: Float32Array; // on the unit sphere, 3 per node
  parents: Int32Array; // the next node downstream
  flow: Float32Array; // how many nodes drain through each one
  heights: Float32Array; // the ground
  levels: Float32Array; // the water's surface, never rising downstream: a pit fills to its rim
  lakeOutlets: Int32Array; // the node each lake spills through, for every node in a lake; else NO_LAKE
  pitCount: number;
  closedLakes: number; // lakes that keep all their water
  spillingLakes: number; // lakes full to the rim, with the rest running on downstream
  lakeLandShare: number; // of all land, lakes of every size
  largestLake: number; // in nodes
  area: Float32Array; // nodes of land draining through each node, whatever the climate
  order: Int32Array; // every land node, springs before sea
  erodedGround: Float32Array; // filled by erodeTerrain
  rowStarts: Int32Array;
  minDrawnFlow: number;
  flowScale: number;
  seaLevel: number;
  nodeCount: number;
  mouthCount: number;
}

// The part that only terrain and sea level change, kept so a climate change can skip regrowing it.
export interface RiverTree extends Pick<RiverNetwork, 'positions' | 'parents' | 'heights' | 'levels' | 'seaLevel' | 'nodeCount' | 'mouthCount'> {
  growthOrder: Int32Array;
  pits: RiverPits;
  heap: NodeHeap;
  neighbors: Int32Array;
  collectNeighbors: (node: number) => number;
  scratch: ClimateScratch;
  rowStarts: Int32Array;
}

interface RiverPits {
  outlets: Int32Array;
  sizes: Int32Array;
  starts: Int32Array; // where each outlet's nodes begin in nodes
  nodes: Int32Array; // every pit's nodes, lowest ground first
}

// Reused by every climate change, so a slider step allocates nothing.
interface ClimateScratch {
  positions: Float32Array;
  parents: Int32Array;
  levels: Float32Array;
  lakeOutlets: Int32Array;
  lakeNodeCounts: Int32Array;
  outletLoss: Float32Array;
  water: Float32Array;
  inflow: Float32Array;
  flow: Float32Array;
  area: Float32Array;
  order: Int32Array;
  erodedGround: Float32Array;
  waiting: Int32Array;
  ready: Int32Array;
  isPlaced: Uint8Array;
}

// Basins by priority (Genevaux et al. 2013, section 5): among the waiting nodes within ζ of the lowest, the one with the
// highest Horton-Strahler priority grows first, so a few rivers reach far inland and gather big basins (their Fig. 5:
// "one large drainage network and several small ones"). Mouths take priorities by Horton's law, about 4 times fewer
// rivers of each higher order. ζ and the branching odds are the paper's user settings. Inferred, TUNABLE
// Pits are filled with a slight slope so water always flows on: Priority-Flood + ε (Barnes et al. 2014), the "optimal
// depression filling" Peytavie et al. 2019 use so river graphs never break up. ε is a step float32 heights can hold,
// not a design value.
const FILL_EPSILON = 1e-6;
// Below sea level counts as sea only in a body this big, in nodes (about 85 km² each); smaller dips cut off from the
// ocean are land, so rivers carry on to the real coast. The ocean as the sea connected to it. Inferred, TUNABLE
const OCEAN_MIN_NODES = 2000;
const RIVER_MAX_PRIORITY = 5;
const RIVER_BIFURCATION_RATIO = 4;
const RIVER_PRIORITY_RANGE = 0.03; // ζ, as a share of the land's relief
const RIVER_CONTINUE_ODDS = 0.6; // Pc: the first new branch keeps its parent's priority
const RIVER_SYMMETRIC_ODDS = 0.15; // Ps: two branches of priority n - 1; the rest (Pa) keep n and add a smaller one
const RIVER_GROWTH_RANDOMNESS = 0.001; // of the land's relief: at 0.02 rivers sat no lower than a random spot. Inferred, TUNABLE
const RIVER_MIN_LAKE_NODES = 8; // every pit fills, but smaller ones don't count as lakes: display only. Inferred, TUNABLE
const RIVER_MIN_LAKE_CATCHMENT = 200; // nodes of land: less than this sinks into the ground. Inferred, TUNABLE
const RIVER_SPLINE_STEP = 3; // nodes between spline points: through every node, the zigzag would stay. Inferred, TUNABLE

// Mulberry32: a small seeded generator, so the same terrain always gives the same rivers.
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// A binary min-heap of nodes by key, in fixed arrays: each node enters once.
class NodeHeap {
  private nodes: Int32Array;
  private keys: Float32Array;
  size = 0;

  constructor(capacity: number) {
    this.nodes = new Int32Array(capacity);
    this.keys = new Float32Array(capacity);
  }

  push(node: number, key: number): void {
    if (this.size === this.nodes.length) {
      const nodes = new Int32Array(this.nodes.length * 2);
      const keys = new Float32Array(this.keys.length * 2);
      nodes.set(this.nodes);
      keys.set(this.keys);
      this.nodes = nodes;
      this.keys = keys;
    }
    let idx = this.size++;
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (this.keys[parentIdx] <= key) break;
      this.nodes[idx] = this.nodes[parentIdx];
      this.keys[idx] = this.keys[parentIdx];
      idx = parentIdx;
    }
    this.nodes[idx] = node;
    this.keys[idx] = key;
  }

  topKey(): number {
    return this.keys[0];
  }

  pop(): number {
    const top = this.nodes[0];
    const lastNode = this.nodes[--this.size];
    const lastKey = this.keys[this.size];
    let idx = 0;
    while (true) {
      let child = 2 * idx + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.keys[child + 1] < this.keys[child]) child++;
      if (this.keys[child] >= lastKey) break;
      this.nodes[idx] = this.nodes[child];
      this.keys[idx] = this.keys[child];
      idx = child;
    }
    this.nodes[idx] = lastNode;
    this.keys[idx] = lastKey;
    return top;
  }
}

// heights is the globe map: rows north to south, columns by longitude (uvToSpherePosition in heightmap.frag.glsl).
// graph holds the nodes and their neighbors (riverGraph.ts), built once for this map's size.
export function buildRiverTree(heights: Float32Array, seaLevel: number, graph: RiverGraph, seed = 1): RiverTree {
  const { rowStarts, sampleIndex, neighborStarts, neighborList, maxDegree } = graph;
  const nodeCount = rowStarts[graph.height];
  const positions = graph.positions.slice();
  const nodeHeights = new Float32Array(nodeCount);
  const random = seededRandom(seed);
  let highest = seaLevel;
  for (let node = 0; node < nodeCount; node++) {
    nodeHeights[node] = heights[sampleIndex[node]];
    highest = Math.max(highest, nodeHeights[node]);
  }

  const neighbors = new Int32Array(maxDegree);
  function collectNeighbors(node: number): number {
    const first = neighborStarts[node];
    const count = neighborStarts[node + 1] - first;
    for (let i = 0; i < count; i++) neighbors[i] = neighborList[first + i];
    return count;
  }

  // Each body of below-sea nodes, found by flood fill; one too small to be ocean is raised to the shore as land.
  const bodyOf = new Int32Array(nodeCount).fill(-1);
  const stack: number[] = [];
  const members: number[] = [];
  for (let start = 0; start < nodeCount; start++) {
    if (bodyOf[start] >= 0 || nodeHeights[start] >= seaLevel) continue;
    members.length = 0;
    stack.push(start);
    bodyOf[start] = start;
    while (stack.length > 0) {
      const node = stack.pop()!;
      members.push(node);
      const first = neighborStarts[node];
      for (let i = first; i < neighborStarts[node + 1]; i++) {
        const next = neighborList[i];
        if (bodyOf[next] >= 0 || nodeHeights[next] >= seaLevel) continue;
        bodyOf[next] = start;
        stack.push(next);
      }
    }
    if (members.length < OCEAN_MIN_NODES) for (const node of members) nodeHeights[node] = seaLevel;
  }

  // Every land node beside the sea is a mouth, and drains into its deepest sea neighbor.
  const parents = new Int32Array(nodeCount).fill(NOT_LAND);
  const growthOrder = new Int32Array(nodeCount);
  const heap = new NodeHeap(nodeCount);
  const randomness = RIVER_GROWTH_RANDOMNESS * (highest - seaLevel);
  let grown = 0;
  let mouthCount = 0;
  for (let node = 0; node < nodeCount; node++) {
    if (nodeHeights[node] < seaLevel) continue;
    const count = collectNeighbors(node);
    let sea = -1;
    for (let i = 0; i < count; i++) {
      const neighbor = neighbors[i];
      if (nodeHeights[neighbor] < seaLevel && (sea < 0 || nodeHeights[neighbor] < nodeHeights[sea])) sea = neighbor;
    }
    if (sea < 0) continue;
    parents[node] = sea;
    growthOrder[grown++] = node;
    mouthCount++;
  }

  // Priority-Flood: from the coast up, each node's level is the lowest height water must reach to get to the sea.
  function waterLevels(): Float32Array {
    const filled = nodeHeights.slice();
    const isDone = new Uint8Array(nodeCount);
    for (let node = 0; node < nodeCount; node++) if (nodeHeights[node] < seaLevel) filled[node] = seaLevel;
    for (let i = 0; i < mouthCount; i++) {
      isDone[growthOrder[i]] = 1;
      heap.push(growthOrder[i], nodeHeights[growthOrder[i]]);
    }
    while (heap.size > 0) {
      const level = heap.topKey();
      const node = heap.pop();
      const count = collectNeighbors(node);
      for (let i = 0; i < count; i++) {
        const next = neighbors[i];
        if (isDone[next] || nodeHeights[next] < seaLevel) continue;
        isDone[next] = 1;
        filled[next] = Math.max(nodeHeights[next], level + FILL_EPSILON);
        heap.push(next, filled[next]);
      }
    }
    return filled;
  }
  const levels = waterLevels();
  // The filled surface is the land the rivers run on: no pits are left, so no lakes form from them.
  for (let node = 0; node < nodeCount; node++) if (nodeHeights[node] >= seaLevel) nodeHeights[node] = levels[node];

  // One waiting list per priority; each step takes the highest priority whose lowest node is within ζ of the lowest
  // overall, as Genevaux's selection does.
  const priority = new Uint8Array(nodeCount);
  const waiting = Array.from({ length: RIVER_MAX_PRIORITY + 1 }, () => new NodeHeap(1024));
  const priorityRange = RIVER_PRIORITY_RANGE * (highest - seaLevel);
  for (let i = 0; i < mouthCount; i++) {
    let rank = 1;
    while (rank < RIVER_MAX_PRIORITY && random() < 1 / RIVER_BIFURCATION_RATIO) rank++;
    priority[growthOrder[i]] = rank;
    waiting[rank].push(growthOrder[i], nodeHeights[growthOrder[i]] + random() * randomness);
  }
  function popNext(): { node: number; key: number } | null {
    let lowest = Infinity;
    for (let rank = 1; rank <= RIVER_MAX_PRIORITY; rank++) if (waiting[rank].size > 0) lowest = Math.min(lowest, waiting[rank].topKey());
    if (lowest === Infinity) return null;
    for (let rank = RIVER_MAX_PRIORITY; rank >= 1; rank--) {
      if (waiting[rank].size > 0 && waiting[rank].topKey() <= lowest + priorityRange) {
        const key = waiting[rank].topKey();
        return { node: waiting[rank].pop(), key };
      }
    }
    return null;
  }

  // A key never falls below its parent's, so water that meets a pit climbs out by the lowest pass. Stepping only onto
  // equal or higher levels keeps the randomness from crossing a ridge anywhere but that pass.
  for (let next = popNext(); next; next = popNext()) {
    const { node, key } = next;
    const rank = priority[node];
    // Génevaux's rules: continue at n, split into two of n - 1, or keep n and add a smaller branch; further ones are 1.
    const roll = random();
    const firstRank = roll < RIVER_CONTINUE_ODDS ? rank : roll < RIVER_CONTINUE_ODDS + RIVER_SYMMETRIC_ODDS ? Math.max(1, rank - 1) : rank;
    const secondRank = roll < RIVER_CONTINUE_ODDS ? 1 : roll < RIVER_CONTINUE_ODDS + RIVER_SYMMETRIC_ODDS ? Math.max(1, rank - 1) : 1 + Math.floor(random() * Math.max(1, rank - 1));
    let added = 0;
    const count = collectNeighbors(node);
    const firstNeighbor = Math.floor(random() * count);
    for (let i = 0; i < count; i++) {
      const child = neighbors[(firstNeighbor + i) % count];
      if (parents[child] !== NOT_LAND || nodeHeights[child] < seaLevel || levels[child] < levels[node]) continue;
      parents[child] = node;
      growthOrder[grown++] = child;
      const childRank = added === 0 ? firstRank : added === 1 ? secondRank : 1;
      priority[child] = childRank;
      added++;
      waiting[childRank].push(child, Math.max(nodeHeights[child], key) + random() * randomness);
    }
  }

  const order = growthOrder.subarray(0, grown);
  const scratch: ClimateScratch = {
    positions: new Float32Array(nodeCount * 3),
    parents: new Int32Array(nodeCount),
    levels: new Float32Array(nodeCount),
    lakeOutlets: new Int32Array(nodeCount),
    lakeNodeCounts: new Int32Array(nodeCount),
    outletLoss: new Float32Array(nodeCount),
    water: new Float32Array(nodeCount),
    inflow: new Float32Array(nodeCount),
    flow: new Float32Array(nodeCount),
    area: new Float32Array(nodeCount),
    order: new Int32Array(grown),
    erodedGround: new Float32Array(nodeCount),
    waiting: new Int32Array(nodeCount),
    ready: new Int32Array(grown),
    isPlaced: new Uint8Array(nodeCount),
  };
  return { positions, parents, heights: nodeHeights, levels, growthOrder: order, pits: findPits(parents, order, nodeHeights, levels), heap, neighbors, collectNeighbors, scratch, rowStarts, seaLevel, nodeCount, mouthCount };
}

// The rivers and lakes for one climate, in the reused scratch arrays: valid until the next call.
export function applyClimate(tree: RiverTree, climate: RiverClimate): RiverNetwork {
  const { heights, growthOrder, pits, heap, neighbors, collectNeighbors, scratch, seaLevel, nodeCount, mouthCount } = tree;
  const { positions, parents, levels } = scratch;
  positions.set(tree.positions);
  parents.set(tree.parents);
  levels.set(tree.levels);
  const lakes = balanceLakes({ parents, growthOrder, heights, levels, pits, budget: waterBudget(climate), heap, neighbors, collectNeighbors, scratch });
  return { positions, parents, heights, levels, ...lakes, erodedGround: scratch.erodedGround, rowStarts: tree.rowStarts, seaLevel, nodeCount, mouthCount };
}

// A flooded node's level is its pit's rim, so a pit is every flooded node spilling through one outlet. Parents first.
function findPits(parents: Int32Array, growthOrder: Int32Array, heights: Float32Array, levels: Float32Array): RiverPits {
  const outlets = new Int32Array(parents.length).fill(NO_LAKE);
  const sizes = new Int32Array(parents.length);
  for (const node of growthOrder) {
    if (levels[node] <= heights[node]) continue;
    const parent = parents[node];
    const outlet = outlets[parent] !== NO_LAKE ? outlets[parent] : parent;
    outlets[node] = outlet;
    sizes[outlet]++;
  }
  const starts = new Int32Array(parents.length + 1);
  for (let node = 0; node < parents.length; node++) starts[node + 1] = starts[node] + sizes[node];
  const nodes = new Int32Array(starts[parents.length]);
  const filled = new Int32Array(parents.length);
  for (let node = 0; node < parents.length; node++) {
    const outlet = outlets[node];
    if (outlet !== NO_LAKE) nodes[starts[outlet] + filled[outlet]++] = node;
  }
  for (let outlet = 0; outlet < parents.length; outlet++) {
    if (sizes[outlet] > 0) nodes.subarray(starts[outlet], starts[outlet + 1]).sort((first, second) => heights[first] - heights[second]);
  }
  return { outlets, sizes, starts, nodes };
}

interface LakeBalanceInput {
  parents: Int32Array;
  growthOrder: Int32Array;
  heights: Float32Array;
  levels: Float32Array;
  pits: RiverPits;
  budget: WaterBudget;
  heap: NodeHeap;
  neighbors: Int32Array;
  collectNeighbors: (node: number) => number;
  scratch: ClimateScratch;
}

// Each lake grows until evaporation from its surface meets what flows in: short of its rim it keeps everything, and the
// land around it drains down to it. At the rim it spills what's left. Springs first, so a lake sees what spills into it.
function balanceLakes({ parents, growthOrder, heights, levels, pits, budget, heap, neighbors, collectNeighbors, scratch }: LakeBalanceInput) {
  const nodeCount = parents.length;
  const { outlets, sizes, starts, nodes: pitNodes } = pits;
  const { lakeOutlets, lakeNodeCounts, outletLoss, water, inflow, flow, area, order, waiting, ready, isPlaced } = scratch;
  lakeOutlets.fill(NO_LAKE);
  lakeNodeCounts.fill(0);
  outletLoss.fill(0); // what a lake's surface takes before it spills
  water.fill(0);
  inflow.fill(0); // into the lake behind each outlet
  flow.fill(0);
  area.fill(0);
  waiting.fill(0);
  isPlaced.fill(0);
  const lakeSizes = new Map<number, number>(); // the closed lakes, by outlet
  let pitCount = 0, closedLakes = 0, spillingLakes = 0, lakeNodeCount = 0, largestLake = 0;

  function closeLake(outlet: number, lakeSize: number): void {
    const nodes = pitNodes.subarray(starts[outlet], starts[outlet + 1]);
    const level = heights[nodes[lakeSize - 1]];
    for (let i = 0; i < lakeSize; i++) {
      const node = nodes[i];
      levels[node] = level;
      parents[node] = LAKE_END;
      isPlaced[node] = 1;
      heap.push(node, heights[node]);
    }
    // The dry rest of the basin now runs down to the lake, not up to its old rim.
    for (let i = lakeSize; i < nodes.length; i++) levels[nodes[i]] = heights[nodes[i]];
    while (heap.size > 0) {
      const node = heap.pop();
      const count = collectNeighbors(node);
      for (let i = 0; i < count; i++) {
        const next = neighbors[i];
        if (isPlaced[next] || outlets[next] !== outlet) continue;
        isPlaced[next] = 1;
        parents[next] = node;
        levels[next] = Math.max(heights[next], levels[node]);
        heap.push(next, levels[next]);
      }
    }
  }

  for (let i = growthOrder.length - 1; i >= 0; i--) {
    const node = growthOrder[i];
    water[node] += 1;
    const pitSize = sizes[node];
    if (pitSize > 0) {
      pitCount++;
      const lakeSize = inflow[node] < RIVER_MIN_LAKE_CATCHMENT ? 0 : Math.floor(inflow[node] * budget.lakeShare);
      if (lakeSize >= pitSize) {
        outletLoss[node] = pitSize / budget.lakeShare;
        water[node] += inflow[node] - outletLoss[node];
      } else {
        outletLoss[node] = Infinity;
        lakeSizes.set(node, Math.max(1, lakeSize));
      }
    }
    const parent = parents[node];
    if (parent < 0) continue;
    if (outlets[node] === parent) inflow[parent] += water[node] * budget.reachKeep;
    else water[parent] += water[node] * budget.reachKeep;
  }
  for (const [outlet, lakeSize] of lakeSizes) closeLake(outlet, lakeSize);

  // Rerouting changed the tree, so the final flow is summed by counting off each node's children.
  let readyCount = 0;
  let orderedCount = 0;
  for (const node of growthOrder) if (parents[node] >= 0) waiting[parents[node]]++;
  for (const node of growthOrder) if (waiting[node] === 0) ready[readyCount++] = node;
  inflow.fill(0);
  while (readyCount > 0) {
    const node = ready[--readyCount];
    order[orderedCount++] = node;
    area[node] += 1;
    flow[node] += 1 + Math.max(0, inflow[node] - outletLoss[node]);
    const parent = parents[node];
    if (parent < 0) continue;
    area[parent] += area[node];
    if (outlets[node] === parent) inflow[parent] += flow[node] * budget.reachKeep;
    else flow[parent] += flow[node] * budget.reachKeep;
    if (--waiting[parent] === 0 && parents[parent] !== NOT_LAND) ready[readyCount++] = parent;
  }
  for (let node = 0; node < nodeCount; node++) flow[node] *= budget.flowScale;

  // Only lakes past RIVER_MIN_LAKE_NODES are marked and counted; smaller ones still hold water.
  const isLake = (node: number) => outlets[node] !== NO_LAKE && levels[node] > heights[node] && (parents[node] === LAKE_END || !lakeSizes.has(outlets[node]));
  for (let node = 0; node < nodeCount; node++) if (isLake(node)) lakeNodeCounts[outlets[node]]++;
  for (let node = 0; node < nodeCount; node++) {
    const outlet = outlets[node];
    if (isLake(node) && lakeNodeCounts[outlet] >= RIVER_MIN_LAKE_NODES) lakeOutlets[node] = outlet;
    const size = lakeNodeCounts[node];
    lakeNodeCount += size;
    largestLake = Math.max(largestLake, size);
    if (size < RIVER_MIN_LAKE_NODES) continue;
    if (lakeSizes.has(node)) closedLakes++;
    else spillingLakes++;
  }
  return { flow, lakeOutlets, pitCount, closedLakes, spillingLakes, lakeLandShare: lakeNodeCount / growthOrder.length, largestLake, area, order: order.subarray(0, orderedCount), minDrawnFlow: budget.minDrawnFlow, flowScale: budget.flowScale };
}

const RIVER_STORED_STRIDE = 9; // x, y, z, height at each end, then flow
export const RIVER_VIEW_STRIDE = 8; // x, y, z, height at each end
export const RIVER_LAKE_STRIDE = 4; // x, y, z, water level
const RIVER_MAX_SEGMENTS = 20000; // the most drawn at once: past it, only larger rivers. Inferred, TUNABLE

// Piecewise cubic splines between confluences, as in Peytavie et al. 2019. Catmull-Rom, and its spacing, are inferred.
export function smoothRiverPaths(network: RiverNetwork): void {
  const { positions, parents, flow, lakeOutlets, minDrawnFlow, nodeCount } = network;
  const isDrawn = (node: number) => parents[node] >= 0 && flow[node] >= minDrawnFlow;
  const drawnChildren = new Uint8Array(nodeCount);
  for (let node = 0; node < nodeCount; node++) if (isDrawn(node)) drawnChildren[parents[node]] = Math.min(255, drawnChildren[parents[node]] + 1);
  const isMouth = (node: number) => parents[parents[node]] < 0;
  const isFixed = (node: number) => drawnChildren[node] !== 1 || lakeOutlets[node] !== NO_LAKE || isMouth(node);

  const chain: number[] = [];
  const point = [0, 0, 0];
  for (let start = 0; start < nodeCount; start++) {
    if (!isDrawn(start) || !isFixed(start) || isMouth(start)) continue;
    chain.length = 0;
    chain.push(start);
    let node = parents[start];
    while (!isFixed(node)) {
      chain.push(node);
      node = parents[node];
    }
    chain.push(node);
    if (chain.length < 3) continue;

    const lastIdx = chain.length - 1;
    const controls: number[] = [];
    for (let idx = 0; idx < lastIdx; idx += RIVER_SPLINE_STEP) controls.push(idx);
    controls.push(lastIdx);
    for (let i = 0; i + 1 < controls.length; i++) {
      const before = chain[controls[Math.max(0, i - 1)]];
      const from = chain[controls[i]];
      const to = chain[controls[i + 1]];
      const after = chain[controls[Math.min(controls.length - 1, i + 2)]];
      for (let idx = controls[i] + 1; idx < controls[i + 1]; idx++) {
        const t = (idx - controls[i]) / (controls[i + 1] - controls[i]);
        for (let axis = 0; axis < 3; axis++) {
          const p0 = positions[before * 3 + axis];
          const p1 = positions[from * 3 + axis];
          const p2 = positions[to * 3 + axis];
          const p3 = positions[after * 3 + axis];
          point[axis] = 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
        }
        const len = Math.hypot(point[0], point[1], point[2]);
        for (let axis = 0; axis < 3; axis++) positions[chain[idx] * 3 + axis] = point[axis] / len;
      }
    }
  }
}

// Every node of a lake, as x, y, z and water level, for the debug dots.
export function extractLakeNodes(network: RiverNetwork): Float32Array {
  const { positions, levels, lakeOutlets, nodeCount } = network;
  let count = 0;
  for (let node = 0; node < nodeCount; node++) if (lakeOutlets[node] !== NO_LAKE) count++;
  const lakeNodes = new Float32Array(count * RIVER_LAKE_STRIDE);
  let write = 0;
  for (let node = 0; node < nodeCount; node++) {
    if (lakeOutlets[node] === NO_LAKE) continue;
    lakeNodes.set(positions.subarray(node * 3, node * 3 + 3), write);
    lakeNodes[write + 3] = levels[node];
    write += RIVER_LAKE_STRIDE;
  }
  return lakeNodes;
}

// The tree boiled down to what can be drawn, a small share of its size, so the rest can be freed.
export function extractRiverSegments(network: RiverNetwork): Float32Array {
  const { positions, parents, flow, levels, minDrawnFlow, nodeCount } = network;
  let count = 0;
  for (let node = 0; node < nodeCount; node++) if (parents[node] >= 0 && flow[node] >= minDrawnFlow) count++;
  const segments = new Float32Array(count * RIVER_STORED_STRIDE);
  let write = 0;
  for (let node = 0; node < nodeCount; node++) {
    const parent = parents[node];
    if (parent < 0 || flow[node] < minDrawnFlow) continue;
    for (const end of [node, parent]) {
      segments[write++] = positions[end * 3];
      segments[write++] = positions[end * 3 + 1];
      segments[write++] = positions[end * 3 + 2];
      segments[write++] = levels[end];
    }
    segments[write++] = flow[node];
  }
  return segments;
}

export function queryRiverSegments(segments: Float32Array, query: { directionX: number; directionY: number; directionZ: number; cosAngle: number; minFlow: number }): Float32Array {
  const total = segments.length / RIVER_STORED_STRIDE;
  const isVisible = (idx: number, minFlow: number) => {
    const start = idx * RIVER_STORED_STRIDE;
    return segments[start + 8] >= minFlow && segments[start] * query.directionX + segments[start + 1] * query.directionY + segments[start + 2] * query.directionZ >= query.cosAngle;
  };
  // Too many in view raises the bar, so a wide view shows its largest rivers whole instead of a random cut.
  let minFlow = query.minFlow;
  let count = 0;
  while (true) {
    count = 0;
    for (let i = 0; i < total; i++) if (isVisible(i, minFlow)) count++;
    if (count <= RIVER_MAX_SEGMENTS) break;
    minFlow *= 2;
  }
  const visible = new Float32Array(count * RIVER_VIEW_STRIDE);
  let write = 0;
  for (let i = 0; i < total; i++) {
    if (!isVisible(i, minFlow)) continue;
    visible.set(segments.subarray(i * RIVER_STORED_STRIDE, i * RIVER_STORED_STRIDE + RIVER_VIEW_STRIDE), write);
    write += RIVER_VIEW_STRIDE;
  }
  return visible;
}
