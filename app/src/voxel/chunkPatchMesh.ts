import * as THREE from 'three';
import { buildPatchGeometry } from '../planet/planetPatchMesh';
import { PATCH_GRID, type TerrainPatch } from '../planet/patch';
import type { EdgeStitchFlags } from '../planet/planetPatches';
import { rootFractions } from './chunkPatches';

// The planet builds skirts at 99% of the radius; built at radius 1, anything
// shorter than this is a skirt vertex.
const SKIRT_LENGTH_TEST = 0.995;
const EDGE_EPSILON = 1e-9;

// The slab's base, below zero so flat low ground never meets it (see smoothMesh.ts).
export function chunkBaseDepth(chunkSize: number): number {
  return -chunkSize * 0.05;
}

type ChunkEdge = 'minU' | 'maxU' | 'minV' | 'maxV';
const CHUNK_EDGES: ChunkEdge[] = ['minU', 'maxU', 'minV', 'maxV'];
const EDGE_NORMALS: Record<ChunkEdge, THREE.Vector3> = {
  minU: new THREE.Vector3(-1, 0, 0),
  maxU: new THREE.Vector3(1, 0, 0),
  minV: new THREE.Vector3(0, 0, -1),
  maxV: new THREE.Vector3(0, 0, 1),
};

// One chunk patch, flat: the planet's stitched patch grid laid on the chunk's
// square. Top vertices are displaced in chunk.vert.glsl; inner skirts drop to
// the base and shade as top surface (they only show through cracks), and
// edges on the chunk's border get walls instead, colored as walls.
export function buildFlatPatchGeometry(
  root: TerrainPatch,
  patch: TerrainPatch,
  chunkSize: number,
  baseDepth: number,
  stitchFlags: EdgeStitchFlags | undefined,
): THREE.BufferGeometry {
  const source = buildPatchGeometry(patch, 1, PATCH_GRID, stitchFlags);
  const sourcePositions = source.getAttribute('position');
  const sourceUvs = source.getAttribute('uv');
  const sourceIndex = source.getIndex()!;
  const fractions = rootFractions(root, patch);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const displaceFlags: number[] = [];
  const topSurfaceFlags: number[] = [];
  const isSkirt: boolean[] = [];
  const rootU: number[] = [];
  const rootV: number[] = [];

  for (let i = 0; i < sourcePositions.count; i++) {
    const localU = sourceUvs.getX(i);
    const localV = sourceUvs.getY(i);
    const fractionU = fractions.minU + localU * (fractions.maxU - fractions.minU);
    const fractionV = fractions.minV + localV * (fractions.maxV - fractions.minV);
    const skirt = Math.hypot(sourcePositions.getX(i), sourcePositions.getY(i), sourcePositions.getZ(i)) < SKIRT_LENGTH_TEST;
    positions.push((fractionU - 0.5) * chunkSize, skirt ? baseDepth : 0, (fractionV - 0.5) * chunkSize);
    normals.push(0, 1, 0);
    uvs.push(localU, localV);
    displaceFlags.push(skirt ? 0 : 1);
    topSurfaceFlags.push(1);
    isSkirt.push(skirt);
    rootU.push(fractionU);
    rootV.push(fractionV);
  }
  source.dispose();

  function onEdge(vertex: number, edge: ChunkEdge): boolean {
    if (edge === 'minU') return Math.abs(rootU[vertex]) < EDGE_EPSILON;
    if (edge === 'maxU') return Math.abs(rootU[vertex] - 1) < EDGE_EPSILON;
    if (edge === 'minV') return Math.abs(rootV[vertex]) < EDGE_EPSILON;
    return Math.abs(rootV[vertex] - 1) < EDGE_EPSILON;
  }

  // Skirt triangles on the chunk's border would lie in the wall's plane, so they go.
  const indices: number[] = [];
  for (let i = 0; i < sourceIndex.count; i += 3) {
    const tri = [sourceIndex.getX(i), sourceIndex.getX(i + 1), sourceIndex.getX(i + 2)];
    const hasSkirt = tri.some((vertex) => isSkirt[vertex]);
    if (hasSkirt && CHUNK_EDGES.some((edge) => tri.every((vertex) => onEdge(vertex, edge)))) continue;
    indices.push(...tri);
  }

  // Walls follow this patch's own border vertices, so their top edge is the surface's edge.
  const topVertexCount = positions.length / 3;
  for (const edge of CHUNK_EDGES) {
    const edgeVertices: number[] = [];
    for (let vertex = 0; vertex < topVertexCount; vertex++) {
      if (!isSkirt[vertex] && onEdge(vertex, edge)) edgeVertices.push(vertex);
    }
    if (edgeVertices.length < 2) continue;
    const alongU = edge === 'minV' || edge === 'maxV';
    edgeVertices.sort((a, b) => (alongU ? rootU[a] - rootU[b] : rootV[a] - rootV[b]));
    const normal = EDGE_NORMALS[edge];
    const wallStart = positions.length / 3;
    for (const vertex of edgeVertices) {
      for (const isTop of [true, false]) {
        positions.push(positions[vertex * 3], isTop ? 0 : baseDepth, positions[vertex * 3 + 2]);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(uvs[vertex * 2], uvs[vertex * 2 + 1]);
        displaceFlags.push(isTop ? 1 : 0);
        topSurfaceFlags.push(0);
      }
    }
    for (let k = 0; k < edgeVertices.length - 1; k++) {
      const topA = wallStart + k * 2;
      const bottomA = topA + 1;
      const topB = topA + 2;
      const bottomB = topA + 3;
      indices.push(topA, topB, bottomB, topA, bottomB, bottomA);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('displace', new THREE.Float32BufferAttribute(displaceFlags, 1));
  geometry.setAttribute('isTopSurface', new THREE.Float32BufferAttribute(topSurfaceFlags, 1));
  return geometry;
}

// The chunk's flat bottom, one quad under every patch.
export function buildChunkBaseGeometry(chunkSize: number, baseDepth: number): THREE.BufferGeometry {
  const half = chunkSize / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-half, baseDepth, -half, half, baseDepth, -half, half, baseDepth, half, -half, baseDepth, half], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(8).fill(0), 2));
  geometry.setAttribute('displace', new THREE.Float32BufferAttribute(new Array(4).fill(0), 1));
  geometry.setAttribute('isTopSurface', new THREE.Float32BufferAttribute(new Array(4).fill(0), 1));
  return geometry;
}
