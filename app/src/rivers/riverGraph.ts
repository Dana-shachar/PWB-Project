import Delaunator from 'delaunator';
import { seededRandom } from './riverTree';

// Where the river nodes sit and which ones water can flow between. The nodes stay on the globe map's rows, jittered,
// so the valley map can still find a pixel's node by its row. Neighbors come from a Delaunay triangulation of the
// nodes instead of the row pattern: "the randomized triangular graph generates more plausible results because the
// edges of the graph better represent possible directions for local streams" (Cordonnier et al. 2016, section 4.1;
// on a grid, Derzapf et al. 2011 note, parallel rivers emerge). It depends only on the grid and the seed, so it's
// built once and reused by every terrain.
const RIVER_NODE_JITTER = 0.8; // of a cell. Inferred, TUNABLE

export interface RiverGraph {
  width: number;
  height: number;
  rowStarts: Int32Array;
  positions: Float32Array; // on the unit sphere, 3 per node
  sampleIndex: Int32Array; // each node's pixel in the globe map, rows north to south
  neighborStarts: Int32Array; // node i's neighbors are neighborList[neighborStarts[i] .. neighborStarts[i + 1])
  neighborList: Int32Array;
  maxDegree: number;
}

export function buildRiverGraph(width: number, height: number, seed = 1): RiverGraph {
  // Fewer nodes per row toward the poles, so they stay about one cell apart instead of bunching up.
  const rowStarts = new Int32Array(height + 1);
  for (let row = 0; row < height; row++) {
    const latitude = (0.5 - (row + 0.5) / height) * Math.PI;
    rowStarts[row + 1] = rowStarts[row] + Math.max(3, Math.round(width * Math.cos(latitude)));
  }
  const nodeCount = rowStarts[height];
  const positions = new Float32Array(nodeCount * 3);
  const sampleIndex = new Int32Array(nodeCount);
  // Stereographic projection from the north pole, the standard way to triangulate points on a sphere in the plane.
  const projected = new Float64Array(nodeCount * 2);
  const random = seededRandom(seed);
  for (let row = 0; row < height; row++) {
    const rowCount = rowStarts[row + 1] - rowStarts[row];
    for (let i = 0; i < rowCount; i++) {
      const node = rowStarts[row] + i;
      const uvX = (i + 0.5 + (random() - 0.5) * RIVER_NODE_JITTER) / rowCount;
      const uvY = 1 - (row + 0.5 + (random() - 0.5) * RIVER_NODE_JITTER) / height;
      // The height where the node is drawn, or its sea and land tests disagree with the map beneath it.
      const column = (Math.floor(uvX * width) + width) % width;
      const sampleRow = Math.max(0, Math.min(height - 1, Math.floor((1 - uvY) * height)));
      sampleIndex[node] = sampleRow * width + column;
      const longitude = (uvX - 0.5) * 2 * Math.PI;
      const latitude = (uvY - 0.5) * Math.PI;
      const x = Math.cos(latitude) * Math.cos(longitude);
      const y = Math.sin(latitude);
      const z = Math.cos(latitude) * Math.sin(longitude);
      positions[node * 3] = x;
      positions[node * 3 + 1] = y;
      positions[node * 3 + 2] = z;
      projected[node * 2] = x / (1 - y);
      projected[node * 2 + 1] = z / (1 - y);
    }
  }

  // Every half-edge a -> b of the triangulation is a neighbor pair; a hull edge has no twin, so it adds both ways.
  const delaunay = new Delaunator(projected);
  const { triangles, halfedges } = delaunay;
  const nextHalfedge = (edge: number) => (edge % 3 === 2 ? edge - 2 : edge + 1);
  const degree = new Int32Array(nodeCount);
  for (let edge = 0; edge < triangles.length; edge++) {
    degree[triangles[edge]]++;
    if (halfedges[edge] < 0) degree[triangles[nextHalfedge(edge)]]++;
  }
  const neighborStarts = new Int32Array(nodeCount + 1);
  let maxDegree = 0;
  for (let node = 0; node < nodeCount; node++) {
    neighborStarts[node + 1] = neighborStarts[node] + degree[node];
    maxDegree = Math.max(maxDegree, degree[node]);
  }
  const neighborList = new Int32Array(neighborStarts[nodeCount]);
  const filled = neighborStarts.slice(0, nodeCount);
  for (let edge = 0; edge < triangles.length; edge++) {
    const from = triangles[edge];
    const to = triangles[nextHalfedge(edge)];
    neighborList[filled[from]++] = to;
    if (halfedges[edge] < 0) neighborList[filled[to]++] = from;
  }
  return { width, height, rowStarts, positions, sampleIndex, neighborStarts, neighborList, maxDegree };
}
