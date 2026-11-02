import { buildRiverGrid } from './riverGrid';
import { RIVER_NO_LAKE, type RiverNetwork } from './riverTree';

// What the rivers leave on the terrain, baked once so no sample has to scan them. R and G hold the eroded height times
// land, and land; B and A do the same for a lake's water level (Derzapf 2011: water height per point), with A negative.
// Multiplying through keeps linear filtering right at the edges. Rows run south to north, as paint UVs do.
// Rivers are carved per patch from the river grid (riverGrid.ts), packed in the rows after these.
export const VALLEY_MAP_WIDTH = 4096;
export const VALLEY_MAP_HEIGHT = 2048;
const RIDGE_BLUR_PASSES = 4; // the fixed tree leaves jumps across ridgelines; these soften them. Inferred, TUNABLE
const WATER_EDGE = 0.8; // of a reach, how soft water's edge is
const LAKE_WATER_REACH = 0.004; // radians, past each lake node, so the whole shore is covered. Inferred, TUNABLE
export const LAKE_EDGE_SCALE = WATER_EDGE * LAKE_WATER_REACH; // radians from full lake cover to none, so the shader reads cover as distance

// One pass of a small box blur over the land channels, wrapping east to west. Water and sea pixels stay as they are.
function blurLand(map: Float32Array, width: number, height: number): void {
  const source = map.slice();
  for (let row = 1; row < height - 1; row++) {
    for (let column = 0; column < width; column++) {
      const pixel = (row * width + column) * 4;
      if (source[pixel + 1] === 0) continue;
      const east = (row * width + (column + 1) % width) * 4;
      const west = (row * width + (column + width - 1) % width) * 4;
      const north = pixel + width * 4;
      const south = pixel - width * 4;
      let sum = source[pixel];
      let count = 1;
      for (const other of [east, west, north, south]) {
        if (source[other + 1] === 0) continue;
        sum += source[other];
        count++;
      }
      map[pixel] = sum / count;
    }
  }
}

// River and lake levels from the terrain the planet shows: the noise mixed with the eroded land by Erosion, as the bake
// mixes them. Rivers only run downhill: any point above the one upstream is lowered to it (Peytavie et al. 2019, 5.1;
// "monotonically adjust river heights along each path" in Plate-Local River Generation). A lake lies at its outlet's height.
function levelsFromTerrain(network: RiverNetwork, erosionStrength: number): Float32Array {
  const { parents, heights, erodedGround, lakeOutlets, order, seaLevel, nodeCount } = network;
  const shown = (node: number) => heights[node] * (1 - erosionStrength) + erodedGround[node] * erosionStrength;
  const levels = new Float32Array(nodeCount);
  for (let node = 0; node < nodeCount; node++) levels[node] = Math.max(seaLevel, shown(node));
  for (let node = 0; node < nodeCount; node++) if (lakeOutlets[node] !== RIVER_NO_LAKE) levels[node] = levels[lakeOutlets[node]];
  for (let idx = 0; idx < order.length; idx++) {
    const node = order[idx];
    const parent = parents[node];
    if (parent < 0 || lakeOutlets[parent] !== RIVER_NO_LAKE) continue;
    if (levels[parent] > levels[node]) levels[parent] = levels[node];
  }
  return levels;
}

export function buildValleyMap(network: RiverNetwork, channelWidth: number, erosionStrength: number): { map: Float32Array; maxBucketCount: number; overflowBuckets: number } {
  const { positions, heights, erodedGround, lakeOutlets, rowStarts, seaLevel, nodeCount } = network;
  const width = VALLEY_MAP_WIDTH;
  const height = VALLEY_MAP_HEIGHT;
  const levels = levelsFromTerrain(network, erosionStrength);
  const grid = buildRiverGrid(network, channelWidth, levels);
  const map = new Float32Array(width * (height + Math.ceil(grid.texels.length / 4 / width)) * 4);
  map.set(grid.texels, width * height * 4);

  // Nodes sit on the same rows as the map, so each pixel reads its node directly.
  for (let row = 0; row < height; row++) {
    const treeRow = height - 1 - row;
    const start = rowStarts[treeRow];
    const rowCount = rowStarts[treeRow + 1] - start;
    for (let column = 0; column < width; column++) {
      const node = start + Math.floor(((column + 0.5) / width) * rowCount);
      if (heights[node] < seaLevel) continue;
      const pixel = (row * width + column) * 4;
      map[pixel] = erodedGround[node];
      map[pixel + 1] = 1;
    }
  }
  for (let pass = 0; pass < RIDGE_BLUR_PASSES; pass++) blurLand(map, width, height);

  const columnCos = new Float32Array(width);
  const columnSin = new Float32Array(width);
  for (let column = 0; column < width; column++) {
    const longitude = ((column + 0.5) / width - 0.5) * 2 * Math.PI;
    columnCos[column] = Math.cos(longitude);
    columnSin[column] = Math.sin(longitude);
  }
  const cell = Math.PI / height;
  const waterBest = new Float32Array(width * height);

  // Writes a lake's level in a disc around one of its nodes, soft to its edge, keeping the strongest cover at each pixel.
  function paintLake(node: number): void {
    const centerX = positions[node * 3], centerY = positions[node * 3 + 1], centerZ = positions[node * 3 + 2];
    const latitude = Math.asin(Math.max(-1, Math.min(1, centerY)));
    const longitude = Math.atan2(centerZ, centerX);
    const reach = LAKE_WATER_REACH;
    const midRow = Math.floor((latitude / Math.PI + 0.5) * height);
    const midColumn = Math.floor((longitude / (2 * Math.PI) + 0.5) * width);
    const rowSpan = Math.ceil(reach / cell);
    for (let row = Math.max(0, midRow - rowSpan); row <= Math.min(height - 1, midRow + rowSpan); row++) {
      const rowLatitude = ((row + 0.5) / height - 0.5) * Math.PI;
      const rowCos = Math.cos(rowLatitude);
      const rowSin = Math.sin(rowLatitude);
      // Past this near the poles every column is in reach, and a wide span would only repeat them.
      const columnSpan = Math.min(width >> 1, Math.ceil(reach / (cell * Math.max(0.02, rowCos))) + 1);
      for (let offset = -columnSpan; offset <= columnSpan; offset++) {
        const column = (midColumn + offset + width) % width;
        const gap = Math.hypot(rowCos * columnCos[column] - centerX, rowSin - centerY, rowCos * columnSin[column] - centerZ);
        if (gap >= reach) continue;
        const cover = Math.min(1, (1 - gap / reach) / WATER_EDGE);
        const pixel = row * width + column;
        if (cover <= waterBest[pixel]) continue;
        waterBest[pixel] = cover;
        map[pixel * 4 + 2] = -levels[node] * cover;
        map[pixel * 4 + 3] = -cover;
      }
    }
  }
  for (let node = 0; node < nodeCount; node++) if (lakeOutlets[node] !== RIVER_NO_LAKE) paintLake(node);
  return { map, maxBucketCount: grid.maxBucketCount, overflowBuckets: grid.overflowBuckets };
}
