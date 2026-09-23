import * as THREE from 'three';
import { sampleChunkHeight } from './chunkGrid';

// A smooth, continuously-displaced alternative to the voxel mesh — same
// sampled region and vertical scale as buildTestChunkDensity(). Extruded
// down to a solid slab (skirt walls + a bottom cap, not just a bare
// surface) so it sits grounded on the grid like the voxel version does,
// rather than floating as a thin disconnected sheet (Dana, 2026-09-23:
// "it's flat and sits on top, not at the grid level"). Computed directly
// on the main thread, not a Worker — cheap enough that the extra file/
// message-passing overhead isn't worth it, unlike the voxel mesh's
// per-voxel face-culling work.
// `heightScale` is independent of `resolution` (Dana, 2026-09-23 — see
// density.ts's own note; the same fix applies here). `size` is the
// footprint's world-space width/depth, also independent of `resolution` —
// resolution only controls how finely that fixed-size footprint is
// subdivided (Dana, 2026-09-23: "the res should affect detail level, not size").
export function buildSmoothChunkGeometry(heightmapImageData: ImageData, resolution: number, heightScale: number, size: number): THREE.BufferGeometry {
  const verticesPerAxis = resolution + 1; // N+1 vertices make N quads per axis
  const cellSize = size / resolution; // world units per voxel column
  const horizontalOffset = resolution / 2;

  function heightIndex(x: number, z: number): number {
    return z * verticesPerAxis + x;
  }

  const heights = new Float32Array(verticesPerAxis * verticesPerAxis);
  for (let z = 0; z < verticesPerAxis; z++) {
    for (let x = 0; x < verticesPerAxis; x++) {
      heights[heightIndex(x, z)] = sampleChunkHeight(heightmapImageData, x, z, resolution) * heightScale; // same vertical scale as the voxel version
    }
  }
  function heightAt(x: number, z: number): number {
    return heights[heightIndex(Math.min(verticesPerAxis - 1, Math.max(0, x)), Math.min(verticesPerAxis - 1, Math.max(0, z)))];
  }
  function topPoint(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3((x - horizontalOffset) * cellSize, heightAt(x, z), (z - horizontalOffset) * cellSize);
  }
  function bottomPoint(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3((x - horizontalOffset) * cellSize, 0, (z - horizontalOffset) * cellSize);
  }
  // Standard central-difference heightmap normal — smaller height where a
  // neighbor is higher tilts the normal away from it. Hand-derived, not
  // copied from an external source (same reasoning as meshWorker.ts's face
  // table — a directly-derivable geometric fact, not a citable algorithm).
  function topNormal(x: number, z: number): THREE.Vector3 {
    const dHeightDx = (heightAt(x + 1, z) - heightAt(x - 1, z)) / 2;
    const dHeightDz = (heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
    return new THREE.Vector3(-dHeightDx, 1, -dHeightDz).normalize();
  }

  const positions: number[] = [];
  const normals: number[] = [];
  function pushTriangle(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, n0: THREE.Vector3, n1: THREE.Vector3, n2: THREE.Vector3) {
    positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    normals.push(n0.x, n0.y, n0.z, n1.x, n1.y, n1.z, n2.x, n2.y, n2.z);
  }
  function pushFlatQuad(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, normal: THREE.Vector3) {
    pushTriangle(p0, p1, p2, normal, normal, normal);
    pushTriangle(p0, p2, p3, normal, normal, normal);
  }

  // Top surface — smooth per-vertex normals (winding verified via the
  // right-hand-rule cross product to give a +Y-dominant normal, matching
  // topNormal()'s own sign convention).
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      const a = topPoint(x, z);
      const b = topPoint(x + 1, z);
      const c = topPoint(x, z + 1);
      const d = topPoint(x + 1, z + 1);
      const na = topNormal(x, z);
      const nb = topNormal(x + 1, z);
      const nc = topNormal(x, z + 1);
      const nd = topNormal(x + 1, z + 1);
      pushTriangle(a, c, b, na, nc, nb);
      pushTriangle(b, c, d, nb, nc, nd);
    }
  }

  // Skirt walls, connecting the top surface's edge down to the grid.
  // Previously 4 separately hand-derived special cases (one already proven
  // wrong — see ISSUES.md, 2026-09-23) — replaced with a single boundary
  // walk + one formula, so there's exactly one place to get the winding
  // right instead of four. The boundary is walked counter-clockwise viewed
  // from above; for a CCW polygon boundary, the outward normal at each edge
  // is always the edge's own travel direction rotated -90° in the XZ plane
  // — a general geometric fact, not something to re-derive per side.
  const boundary: [number, number][] = [];
  for (let x = 0; x < resolution; x++) boundary.push([x, 0]); // north edge, z=0
  for (let z = 0; z < resolution; z++) boundary.push([resolution, z]); // east edge, x=resolution
  for (let x = resolution; x > 0; x--) boundary.push([x, resolution]); // south edge, z=resolution
  for (let z = resolution; z > 0; z--) boundary.push([0, z]); // west edge, x=0

  for (let i = 0; i < boundary.length; i++) {
    const [x1, z1] = boundary[i];
    const [x2, z2] = boundary[(i + 1) % boundary.length];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const outward = new THREE.Vector3(dz, 0, -dx).normalize(); // travel direction rotated -90°
    pushFlatQuad(topPoint(x1, z1), topPoint(x2, z2), bottomPoint(x2, z2), bottomPoint(x1, z1), outward);
  }

  // Bottom cap, normal (0,-1,0) — flat, no subdivision needed.
  pushFlatQuad(
    bottomPoint(0, 0),
    bottomPoint(resolution, 0),
    bottomPoint(resolution, resolution),
    bottomPoint(0, resolution),
    new THREE.Vector3(0, -1, 0),
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  return geometry;
}
