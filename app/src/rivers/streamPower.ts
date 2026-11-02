import { RIVER_NO_LAKE, type RiverNetwork } from './riverTree';

// The land as the rivers would have shaped it: the stream power law, E = K * A^m * S^n, with n = 1 and m = 0.5 as in
// Braun and Willett 2013 and Cordonnier et al. 2016. Noise sets how fast each place rises. Those papers step through time
// and let the rivers move; a fixed tree settles directly (inferred), so one pass from the sea up gives the same balance:
// each node stands above its downstream neighbor by rise / sqrt(area).
const MIN_RISE = 0.05; // of the fastest, so low ground still slopes to its river. Inferred, TUNABLE
const MAX_STEP = 0.03; // of the land's height per node: Cordonnier caps slopes so peaks don't spike. Inferred, TUNABLE

// Replaces network.levels with the water surface on the new land, and fills erodedGround with the land itself.
export function erodeTerrain(network: RiverNetwork): void {
  const { parents, heights, levels, area, order, lakeOutlets, seaLevel, erodedGround } = network;
  let highest = seaLevel;
  for (let i = 0; i < order.length; i++) highest = Math.max(highest, heights[order[i]]);
  const relief = Math.max(0.0001, highest - seaLevel);

  // Sets each node from its parent, parents first: order runs springs to sea, so it's read backward.
  function walk(scale: number, maxStep: number): number {
    let tallest = 0;
    for (let i = order.length - 1; i >= 0; i--) {
      const node = order[i];
      const parent = parents[node];
      const rate = Math.max(MIN_RISE, (heights[node] - seaLevel) / relief);
      const step = Math.min(maxStep, (scale * rate) / Math.sqrt(area[node]));
      let height: number;
      if (parent < 0) height = levels[node]; // a closed lake or sink keeps the level the balance gave it
      else if (heights[parent] < seaLevel) height = seaLevel + step; // a mouth
      else height = erodedGround[parent] + (lakeOutlets[node] !== RIVER_NO_LAKE ? 0 : step); // a lake lies flat
      erodedGround[node] = height;
      tallest = Math.max(tallest, height - seaLevel);
    }
    return tallest;
  }

  // The first pass measures; the second scales it so the land keeps the noise's height.
  walk(relief / Math.max(0.0001, walk(1, Infinity)), MAX_STEP * relief);

  for (let i = 0; i < order.length; i++) {
    const node = order[i];
    const surface = erodedGround[node];
    const depth = lakeOutlets[node] !== RIVER_NO_LAKE ? levels[node] - heights[node] : 0;
    levels[node] = surface;
    erodedGround[node] = surface - depth;
  }
}
