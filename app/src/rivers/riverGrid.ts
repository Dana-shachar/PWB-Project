// Every river span, filed by place, so each patch bake measures its distance to rivers at its own resolution
// (Plate-Local River Generation). Packed as RGBA texels read by index in heightmap.frag.glsl: buckets (first entry,
// count), then entries (a span's first texel), then spans. Restored from commit 1f421af, keeping its packing and its
// Catmull-Rom curves (Peytavie et al. 2019) and dropping the shaping it invented (winding, estuaries, source heads).
export const RIVER_GRID_WIDTH = 2048;
export const RIVER_GRID_HEIGHT = 1024;
export const RIVER_MAX_BUCKET_PIECES = 48; // the shader's loop limit; a bucket keeps its widest spans first
export const RIVER_BLEND_WIDTH = 0.002; // radians past a river's edge over which the land blends to it. Inferred, TUNABLE
export const RIVER_CURVE_STEPS = 4; // straight pieces per span
const RIVER_SPAN_TEXELS = RIVER_CURVE_STEPS + 2; // each point's xyz and level, then the widths and depths at each end

// The river nodes: unit-sphere positions, the node each drains to (-1 for none), and per node its water level, half
// width (radians) and depth (globe map units).
export interface RiverNodes {
  count: number;
  positions: Float32Array;
  parents: Int32Array;
  levels: Float32Array;
  halfWidths: Float32Array;
  depths: Float32Array;
  isSpan: Uint8Array; // 1 where a span starts: a river node with a parent
  flow: Float32Array; // picks each node's main child, the curve's lead-in
}

export function buildRiverGrid(nodes: RiverNodes): { texels: Float32Array; spanCount: number; maxBucketCount: number; overflowBuckets: number } {
  const { count, positions, parents, levels, halfWidths, depths, isSpan, flow } = nodes;
  const spanNodes: number[] = [];
  for (let node = 0; node < count; node++) if (isSpan[node] && parents[node] >= 0) spanNodes.push(node);
  const spanCount = spanNodes.length;
  const nextOf = (node: number) => (parents[node] >= 0 ? parents[node] : node);
  const mainChild = new Int32Array(count).fill(-1);
  for (const node of spanNodes) {
    const parent = parents[node];
    if (mainChild[parent] < 0 || flow[node] > flow[mainChild[parent]]) mainChild[parent] = node;
  }

  // Points along each span: a Catmull-Rom curve through the main branch above, its ends and the node below (Peytavie
  // et al. 2019: piecewise cubic splines).
  const pointCount = RIVER_CURVE_STEPS + 1;
  const spanPoints = new Float32Array(spanCount * pointCount * 4);
  for (let i = 0; i < spanCount; i++) {
    const node = spanNodes[i];
    const parent = nextOf(node);
    const before = mainChild[node] >= 0 ? mainChild[node] : node;
    const after = nextOf(parent);
    for (let step = 0; step < pointCount; step++) {
      const t = step / RIVER_CURVE_STEPS;
      const at = (i * pointCount + step) * 4;
      let len = 0;
      for (let axis = 0; axis < 3; axis++) {
        const p0 = positions[before * 3 + axis], p1 = positions[node * 3 + axis];
        const p2 = positions[parent * 3 + axis], p3 = positions[after * 3 + axis];
        const value = 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
        spanPoints[at + axis] = value;
        len += value * value;
      }
      len = Math.sqrt(len) || 1;
      for (let axis = 0; axis < 3; axis++) spanPoints[at + axis] /= len;
      spanPoints[at + 3] = levels[node] + (levels[parent] - levels[node]) * t;
    }
  }
  // A span ends at its own width and starts at the width of the main branch above it, so rivers widen downstream.
  const endWidth = (i: number) => halfWidths[spanNodes[i]];
  const startWidth = (i: number) => (mainChild[spanNodes[i]] >= 0 ? halfWidths[mainChild[spanNodes[i]]] : halfWidths[spanNodes[i]]);
  const startDepth = (i: number) => (mainChild[spanNodes[i]] >= 0 ? depths[mainChild[spanNodes[i]]] : depths[spanNodes[i]]);

  // Each span goes once in every bucket one of its pieces can reach: bounds narrow the search, then bucket centers are measured.
  const bucketCount = RIVER_GRID_WIDTH * RIVER_GRID_HEIGHT;
  const bucketLists: number[][] = new Array(bucketCount);
  const rowSize = Math.PI / RIVER_GRID_HEIGHT;
  const columnSize = (2 * Math.PI) / RIVER_GRID_WIDTH;
  let entryCount = 0;
  for (let i = 0; i < spanCount; i++) {
    const pad = endWidth(i) + RIVER_BLEND_WIDTH;
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
    list.sort((first, second) => endWidth(second) - endWidth(first));
    texels[bucket * 4] = entry;
    texels[bucket * 4 + 1] = list.length;
    maxBucketCount = Math.max(maxBucketCount, list.length);
    if (list.length > RIVER_MAX_BUCKET_PIECES) overflowBuckets++;
    for (const span of list) texels[entry++ * 4] = spanStart + span * RIVER_SPAN_TEXELS;
  }
  for (let i = 0; i < spanCount; i++) {
    const at = (spanStart + i * RIVER_SPAN_TEXELS) * 4;
    texels.set(spanPoints.subarray(i * pointCount * 4, (i + 1) * pointCount * 4), at);
    texels[at + pointCount * 4] = startWidth(i);
    texels[at + pointCount * 4 + 1] = endWidth(i);
    texels[at + pointCount * 4 + 2] = startDepth(i);
    texels[at + pointCount * 4 + 3] = depths[spanNodes[i]];
  }
  return { texels, spanCount, maxBucketCount, overflowBuckets };
}
