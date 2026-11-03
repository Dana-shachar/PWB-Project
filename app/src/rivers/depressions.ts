// Which dips hold water. The depression hierarchy (Barnes, Callaghan and Wickert 2020, "Computing water flow through
// complex landscapes, Part 2", section 3) nests every dip inside the larger one it joins at its lowest sill. Fill-Spill-
// Merge (same authors 2021, Part 3, sections 3.2 and 3.3) then fills them from the bottom up: a full dip spills into its
// neighbor, two full neighbors merge, and the rest goes on to the ocean. How much a dip holds is Langbein's balance for
// closed lakes (USGS Professional Paper 412): a lake grows until evaporation from its surface takes all that flows in.

export const OCEAN = 0;
const NO_DEPRESSION = -1;
const NO_LINK = -1;
// Barnes et al. 2020, Fig. 9c: depressions under 30 cells are filtered out, so they hold no lake.
const MIN_DEPRESSION_CELLS = 30;

interface MinHeap {
  size: number;
  push(node: number, key: number): void;
  pop(): number;
}

export interface DepressionHierarchy {
  count: number; // depressions, the ocean included as 0
  labels: Int32Array; // per node: its leaf depression
  flowTo: Int32Array; // per node: the neighbor it drains to on the way down to its pit, -1 at pits and in the ocean
  pits: Int32Array; // per depression: its pit node, -1 for merged ones and the ocean
  parent: Int32Array; // per depression: the one it merges into, OCEAN, or -1 for a basin no outlet reaches
  childA: Int32Array; // per merged depression: its two halves, -1 for leaves
  childB: Int32Array;
  spill: Float32Array; // per depression: the height where it overflows
  geolink: Int32Array; // per depression: the leaf it overflows into (OCEAN for the sea itself)
  oceanLinkStarts: Int32Array; // per depression: the trees that overflow into it, as a list in oceanLinkList
  oceanLinkList: Int32Array;
  area: Int32Array; // per depression: cells under its spill height, its descendants included
}

// Section 3.3 and 3.4: a Priority-Flood from the ocean and every pit labels each node with its leaf depression and keeps
// the lowest sill between each pair; sorting the sills then joins depressions into a forest of binary trees.
export function buildDepressionHierarchy(heights: Float32Array, isOcean: Uint8Array, neighborStarts: Int32Array, neighborList: Int32Array, heap: MinHeap): DepressionHierarchy {
  const nodeCount = heights.length;
  const labels = new Int32Array(nodeCount).fill(NO_DEPRESSION);
  const flowTo = new Int32Array(nodeCount).fill(-1);
  const pitList: number[] = [-1];
  for (let node = 0; node < nodeCount; node++) {
    if (isOcean[node]) {
      labels[node] = OCEAN;
      heap.push(node, heights[node]);
      continue;
    }
    // A pit drains to no neighbor: none is lower (section 3.2).
    let isPit = true;
    for (let i = neighborStarts[node]; i < neighborStarts[node + 1]; i++) {
      if (heights[neighborList[i]] < heights[node]) { isPit = false; break; }
    }
    if (isPit) heap.push(node, heights[node]);
  }

  // The lowest sill between each pair of leaves, keyed by both labels.
  const sills = new Map<number, number>();
  const KEY_SCALE = 8388608; // above any label, so lower * KEY_SCALE + higher is unique
  while (heap.size > 0) {
    const cell = heap.pop();
    let label = labels[cell];
    if (label === NO_DEPRESSION) {
      label = pitList.length;
      pitList.push(cell);
      labels[cell] = label;
    }
    for (let i = neighborStarts[cell]; i < neighborStarts[cell + 1]; i++) {
      const next = neighborList[i];
      const nextLabel = labels[next];
      if (nextLabel === NO_DEPRESSION) {
        labels[next] = label;
        flowTo[next] = cell;
        heap.push(next, heights[next]);
      } else if (nextLabel !== label) {
        const key = Math.min(label, nextLabel) * KEY_SCALE + Math.max(label, nextLabel);
        const elevation = Math.max(heights[cell], heights[next]);
        const known = sills.get(key);
        if (known === undefined || elevation < known) sills.set(key, elevation);
      }
    }
  }

  // Leaves, then one merged depression per joining sill at most.
  const leafCount = pitList.length;
  const capacity = 2 * leafCount;
  const parent = new Int32Array(capacity).fill(-1);
  const childA = new Int32Array(capacity).fill(-1);
  const childB = new Int32Array(capacity).fill(-1);
  const spill = new Float32Array(capacity).fill(Infinity);
  const geolink = new Int32Array(capacity).fill(NO_LINK);
  const pits = new Int32Array(capacity).fill(-1);
  pits.set(pitList);
  const setOf = new Int32Array(capacity);
  for (let idx = 0; idx < capacity; idx++) setOf[idx] = idx;
  // Disjoint set without union by rank, so each root stays the top of its tree (section 3.4).
  const find = (start: number) => {
    let root = start;
    while (setOf[root] !== root) root = setOf[root];
    for (let idx = start; setOf[idx] !== root;) { const up = setOf[idx]; setOf[idx] = root; idx = up; }
    return root;
  };
  const sorted = Array.from(sills.entries()).sort((first, second) => first[1] - second[1]);
  const oceanLinks: number[][] = [];
  let count = leafCount;
  for (const [key, elevation] of sorted) {
    let leafA = Math.floor(key / KEY_SCALE);
    let leafB = key - leafA * KEY_SCALE;
    let rootA = find(leafA);
    let rootB = find(leafB);
    if (rootA === rootB) continue;
    if (rootA === OCEAN || rootB === OCEAN) {
      if (rootA === OCEAN) { [leafA, leafB] = [leafB, leafA]; [rootA, rootB] = [rootB, rootA]; }
      // rootA overflows into leafB's tree, which reaches the sea.
      parent[rootA] = OCEAN;
      spill[rootA] = elevation;
      geolink[rootA] = leafB;
      (oceanLinks[leafB] ??= []).push(rootA);
      setOf[rootA] = OCEAN;
    } else {
      const merged = count++;
      childA[merged] = rootA;
      childB[merged] = rootB;
      parent[rootA] = merged;
      parent[rootB] = merged;
      spill[rootA] = elevation;
      spill[rootB] = elevation;
      geolink[rootA] = leafB;
      geolink[rootB] = leafA;
      setOf[rootA] = merged;
      setOf[rootB] = merged;
    }
  }
  const oceanLinkStarts = new Int32Array(count + 1);
  for (let dep = 0; dep < count; dep++) oceanLinkStarts[dep + 1] = oceanLinkStarts[dep] + (oceanLinks[dep]?.length ?? 0);
  const oceanLinkList = new Int32Array(oceanLinkStarts[count]);
  for (let dep = 0; dep < count; dep++) oceanLinkList.set(oceanLinks[dep] ?? [], oceanLinkStarts[dep]);

  // Each cell counts toward the lowest depression whose spill height is above it, and so toward all its ancestors.
  const area = new Int32Array(count);
  for (let node = 0; node < nodeCount; node++) {
    let dep = labels[node];
    while (dep > OCEAN && heights[node] >= spill[dep]) dep = parent[dep];
    if (dep > OCEAN) area[dep]++;
  }
  for (let dep = leafCount; dep < count; dep++) area[dep] += area[childA[dep]] + area[childB[dep]]; // children come first

  return { count, labels, flowTo, pits, parent, childA, childB, spill, geolink, oceanLinkStarts, oceanLinkList, area };
}

export interface LakeResult {
  lakeOf: Int32Array; // per node: the lake it lies under, -1 if none
  catchmentLevel: Float32Array; // per node: the water level of the lake whose depression it lies in, NaN if none
  closedCatchment: Uint8Array; // per node: 1 if its water ends in a closed lake
  lakeLevel: Float32Array; // per lake: its water level
  lakeSpills: Uint8Array; // per lake: 1 if full to its sill
  lakeCount: number;
  lakeCells: number;
  largestLake: number;
}

// Sections 3.2 and 3.3, with Langbein's balance as each depression's capacity: a lake over `area` cells takes all the
// inflow of area / lakeShare cells of land (lakeShare: a closed lake's area over the land draining into it).
export function fillSpillMerge(dh: DepressionHierarchy, heights: Float32Array, neighborStarts: Int32Array, neighborList: Int32Array, lakeShare: number, heap: MinHeap): LakeResult {
  const { count, labels, parent, childA, childB, spill, geolink, oceanLinkStarts, oceanLinkList, area, pits } = dh;
  const nodeCount = heights.length;
  const isLeaf = (dep: number) => childA[dep] < 0;
  const capTotal = new Float64Array(count);
  const capMarginal = new Float64Array(count);
  for (let dep = 1; dep < count; dep++) {
    capTotal[dep] = area[dep] < MIN_DEPRESSION_CELLS ? 0 : lakeShare > 0 ? area[dep] / lakeShare : Infinity;
    capMarginal[dep] = isLeaf(dep) ? capTotal[dep] : Math.max(0, capTotal[dep] - capTotal[childA[dep]] - capTotal[childB[dep]]);
  }

  // Section 3.1: each cell's runoff reaches the pit of its leaf. One unit per cell, as the rivers count it.
  const water = new Float64Array(count);
  for (let node = 0; node < nodeCount; node++) if (labels[node] > OCEAN) water[labels[node]] += 1;

  const full = new Uint8Array(count);
  const siblingOf = (dep: number) => {
    const up = parent[dep];
    if (up <= OCEAN) return -1;
    return childA[up] === dep ? childB[up] : childA[up];
  };
  // The inner traversal: water poured into a leaf fills it, then its sibling's tree, then their parent, until it finds
  // room or reaches `stop`, which the outer traversal handles next.
  function pour(start: number, amount: number, stop: number): void {
    let dep = start;
    water[dep] += amount;
    while (dep !== stop) {
      const over = water[dep] - capMarginal[dep];
      if (over < 0) return;
      water[dep] = capMarginal[dep];
      full[dep] = 1;
      if (over === 0) return;
      const sibling = siblingOf(dep);
      if (sibling >= 0 && !full[sibling]) {
        dep = geolink[dep];
        water[dep] += over;
        continue;
      }
      dep = parent[dep];
      if (dep <= OCEAN) return; // to the sea
      water[dep] += over;
    }
  }

  // The outer traversal, post-order from the ocean: the trees that overflow into a depression first, then its halves.
  const order: number[] = [];
  const stack: number[] = [];
  const expanded = new Uint8Array(count);
  for (let dep = 1; dep < count; dep++) if (parent[dep] < 0 || (parent[dep] === OCEAN && geolink[dep] === OCEAN)) stack.push(dep);
  while (stack.length > 0) {
    const dep = stack[stack.length - 1];
    if (expanded[dep]) { stack.pop(); order.push(dep); continue; }
    expanded[dep] = 1;
    if (!isLeaf(dep)) { stack.push(childB[dep]); stack.push(childA[dep]); }
    for (let i = oceanLinkStarts[dep + 1] - 1; i >= oceanLinkStarts[dep]; i--) stack.push(oceanLinkList[i]);
  }
  for (const dep of order) {
    if (parent[dep] < 0) continue; // a basin with no outlet keeps it all
    const over = water[dep] - capMarginal[dep];
    if (over < 0) continue;
    water[dep] = capMarginal[dep];
    full[dep] = 1;
    if (over === 0) continue;
    if (parent[dep] === OCEAN) {
      if (geolink[dep] > OCEAN) water[geolink[dep]] += over; // that tree comes later in the order
      continue;
    }
    pour(geolink[dep], over, parent[dep]);
  }

  // Section 3.3: the highest depression in each tree that holds water is a lake. A full one stands at its spill height;
  // a partly full one floods its cells lowest first until their area balances what flows in (Langbein).
  const lakeOf = new Int32Array(nodeCount).fill(-1);
  const catchmentLevel = new Float32Array(nodeCount).fill(NaN);
  const closedCatchment = new Uint8Array(nodeCount);
  const lakeLevels: number[] = [];
  const lakeSpills: number[] = [];
  const subtreeOf = new Int32Array(count).fill(-1); // per leaf: the lake depression it lies under, while that lake is built
  const visited = new Uint8Array(nodeCount);
  const flooded: number[] = [];
  let lakeCells = 0;
  let largestLake = 0;
  const leavesOf = (top: number, out: number[]) => {
    const pending = [top];
    while (pending.length > 0) {
      const dep = pending.pop()!;
      if (isLeaf(dep)) out.push(dep);
      else pending.push(childA[dep], childB[dep]);
    }
  };
  const subtreeWater = (top: number) => {
    let sum = 0;
    const pending = [top];
    while (pending.length > 0) {
      const dep = pending.pop()!;
      sum += water[dep];
      if (!isLeaf(dep)) pending.push(childA[dep], childB[dep]);
    }
    return sum;
  };
  const tops: number[] = [];
  const pending: number[] = [];
  for (let dep = 1; dep < count; dep++) if (parent[dep] <= OCEAN) pending.push(dep);
  while (pending.length > 0) {
    const dep = pending.pop()!;
    if (isLeaf(dep) || water[dep] > 0 || full[dep]) { if (subtreeWater(dep) > 0 || full[dep]) tops.push(dep); }
    else pending.push(childA[dep], childB[dep]);
  }
  const leaves: number[] = [];
  for (const top of tops) {
    leaves.length = 0;
    leavesOf(top, leaves);
    for (const leaf of leaves) subtreeOf[leaf] = top;
    const isFull = full[top] === 1;
    const neededArea = isFull ? Infinity : subtreeWater(top) * lakeShare;
    flooded.length = 0;
    heap.push(pits[leaves[0]], heights[pits[leaves[0]]]);
    visited[pits[leaves[0]]] = 1;
    let level = heights[pits[leaves[0]]];
    while (heap.size > 0) {
      const cell = heap.pop();
      if (heights[cell] >= spill[top] || flooded.length >= neededArea) {
        level = isFull ? spill[top] : heights[cell];
        break;
      }
      flooded.push(cell);
      level = heights[cell];
      for (let i = neighborStarts[cell]; i < neighborStarts[cell + 1]; i++) {
        const next = neighborList[i];
        if (visited[next] || labels[next] <= OCEAN || subtreeOf[labels[next]] !== top) continue;
        visited[next] = 1;
        heap.push(next, heights[next]);
      }
    }
    while (heap.size > 0) heap.pop();
    for (const leaf of leaves) subtreeOf[leaf] = -1;
    if (flooded.length < MIN_DEPRESSION_CELLS) continue;
    const lake = lakeLevels.length;
    lakeLevels.push(level);
    lakeSpills.push(isFull ? 1 : 0);
    for (const cell of flooded) lakeOf[cell] = lake;
    lakeCells += flooded.length;
    largestLake = Math.max(largestLake, flooded.length);
    // The lake's level covers its whole depression; water shows only where the ground is below it (3.3).
    for (const leaf of leaves) subtreeOf[leaf] = top;
    for (const cell of flooded) {
      // Spread over the depression from the flooded cells, so its whole basin carries the level.
      const queue = [cell];
      while (queue.length > 0) {
        const at = queue.pop()!;
        if (!Number.isNaN(catchmentLevel[at])) continue;
        catchmentLevel[at] = level;
        if (!isFull) closedCatchment[at] = 1;
        for (let i = neighborStarts[at]; i < neighborStarts[at + 1]; i++) {
          const next = neighborList[i];
          if (Number.isNaN(catchmentLevel[next]) && labels[next] > OCEAN && subtreeOf[labels[next]] === top) queue.push(next);
        }
      }
    }
    for (const leaf of leaves) subtreeOf[leaf] = -1;
  }
  visited.fill(0);
  return { lakeOf, catchmentLevel, closedCatchment, lakeLevel: Float32Array.from(lakeLevels), lakeSpills: Uint8Array.from(lakeSpills), lakeCount: lakeLevels.length, lakeCells, largestLake };
}
