import { RIVER_NO_LAKE, type RiverNetwork } from './riverTree';

// What the rivers leave on the terrain, baked once so no sample has to scan them. R and G hold the eroded height times
// land, and land; B and A do the same for the local water level (Derzapf 2011: water height per point), with A negative
// for lakes. Multiplying through keeps linear filtering right at the edges. Rows run south to north, as paint UVs do.
export const VALLEY_MAP_WIDTH = 4096;
export const VALLEY_MAP_HEIGHT = 2048;
const RIDGE_BLUR_PASSES = 4; // the fixed tree leaves jumps across ridgelines; these soften them. Inferred, TUNABLE
const RIVER_BASE_WIDTH = 0.0007; // radians, half a river's width per step of size. Inferred, TUNABLE
const RIVER_MIN_REACH = 0.0012; // about a map pixel: narrower would break into dashes, so cover tapers the tips instead
const RIVER_TIP_COVER = 0.3; // at a river's smallest flow: the shader's cutoff, so tips narrow to a point
const RIVER_TIP_LENGTH = 2; // steps of river size until it's at full cover. Inferred, TUNABLE
const RIVER_MAX_WIDTH = 0.004;
const RIVER_MIN_AREA = 64; // nodes of land: wet worlds swell rivers, they don't draw one on every slope. Inferred, TUNABLE
const WATER_EDGE = 0.8; // of a reach, how soft water's edge is
const LAKE_WATER_REACH = 0.004; // radians, past each lake node, so the whole shore is covered. Inferred, TUNABLE

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

export function buildValleyMap(network: RiverNetwork, channelWidth: number): Float32Array {
  const { positions, parents, flow, area, levels, heights, erodedGround, lakeOutlets, minDrawnFlow, rowStarts, seaLevel, nodeCount } = network;
  const width = VALLEY_MAP_WIDTH;
  const height = VALLEY_MAP_HEIGHT;
  const map = new Float32Array(width * height * 4);
  const waterBest = new Float32Array(width * height);

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

  // Writes one stretch of water along a segment, soft to its edge, keeping the strongest cover at each pixel.
  function paintWater(node: number, parent: number, reach: number, maxCover: number, startLevel: number, endLevel: number, isLake: boolean): void {
    const startX = positions[node * 3], startY = positions[node * 3 + 1], startZ = positions[node * 3 + 2];
    const stepX = positions[parent * 3] - startX, stepY = positions[parent * 3 + 1] - startY, stepZ = positions[parent * 3 + 2] - startZ;
    const stepLenSq = Math.max(1e-12, stepX * stepX + stepY * stepY + stepZ * stepZ);
    const latitude = Math.asin(Math.max(-1, Math.min(1, startY + stepY / 2)));
    const longitude = Math.atan2(startZ + stepZ / 2, startX + stepX / 2);
    const padding = reach + Math.sqrt(stepLenSq) / 2;
    const reachSq = reach * reach;
    const midRow = Math.floor((latitude / Math.PI + 0.5) * height);
    const midColumn = Math.floor((longitude / (2 * Math.PI) + 0.5) * width);
    const rowSpan = Math.ceil(padding / cell);
    const firstRow = Math.max(0, midRow - rowSpan);
    const lastRow = Math.min(height - 1, midRow + rowSpan);
    for (let row = firstRow; row <= lastRow; row++) {
      const rowLatitude = ((row + 0.5) / height - 0.5) * Math.PI;
      const rowCos = Math.cos(rowLatitude);
      const rowSin = Math.sin(rowLatitude);
      // Past this near the poles every column is in reach, and a wide span would only repeat them.
      const columnSpan = Math.min(width >> 1, Math.ceil(padding / (cell * Math.max(0.02, rowCos))) + 1);
      for (let offset = -columnSpan; offset <= columnSpan; offset++) {
        const column = (midColumn + offset + width) % width;
        const pointX = rowCos * columnCos[column], pointZ = rowCos * columnSin[column];
        const share = Math.max(0, Math.min(1, ((pointX - startX) * stepX + (rowSin - startY) * stepY + (pointZ - startZ) * stepZ) / stepLenSq));
        const gapX = pointX - startX - share * stepX, gapY = rowSin - startY - share * stepY, gapZ = pointZ - startZ - share * stepZ;
        const gapSq = gapX * gapX + gapY * gapY + gapZ * gapZ;
        if (gapSq >= reachSq) continue;
        const cover = maxCover * Math.min(1, (1 - Math.sqrt(gapSq) / reach) / WATER_EDGE);
        const pixel = row * width + column;
        if (cover <= waterBest[pixel]) continue;
        waterBest[pixel] = cover;
        const signedCover = isLake ? -cover : cover;
        map[pixel * 4 + 2] = (startLevel + share * (endLevel - startLevel)) * signedCover;
        map[pixel * 4 + 3] = signedCover;
      }
    }
  }

  for (let node = 0; node < nodeCount; node++) {
    const parent = parents[node];
    if (parent < 0 || flow[node] < minDrawnFlow || area[node] < RIVER_MIN_AREA || lakeOutlets[node] !== RIVER_NO_LAKE) continue;
    const size = Math.sqrt(flow[node] / minDrawnFlow); // 1 at a river's tip
    const reach = Math.max(RIVER_MIN_REACH, Math.min(RIVER_MAX_WIDTH, RIVER_BASE_WIDTH * size * channelWidth));
    const cover = Math.min(1, RIVER_TIP_COVER + ((1 - RIVER_TIP_COVER) * (size - 1)) / RIVER_TIP_LENGTH);
    paintWater(node, parent, reach, cover, levels[node], levels[parent], false);
  }
  // Lakes write their level over everything: the terrain draws the shoreline.
  for (let node = 0; node < nodeCount; node++) {
    if (lakeOutlets[node] !== RIVER_NO_LAKE) paintWater(node, node, LAKE_WATER_REACH, 1, levels[node], levels[node], true);
  }
  return map;
}
