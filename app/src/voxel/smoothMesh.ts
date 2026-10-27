import * as THREE from 'three';

// A smooth chunk's geometry, built *flat* — the top surface's real height
// is no longer baked in here at all. It comes from a vertex shader sampling
// the patch's own heightmap texture directly (chunk.vert.glsl), the same
// vertex-texture-fetch technique vertex.glsl already uses for the planet,
// so the chunk's displayed detail is only the heightmap texture's own
// resolution, never the CPU-readback cost that used to cap it (see
// ISSUES.md, [B32]). Extruded down to a solid slab (skirt walls + a bottom
// cap, not just a bare surface) so it sits grounded on the grid like the
// voxel version does, rather than floating as a thin disconnected sheet
// (Dana, 2026-09-23: "it's flat and sits on top, not at the grid level").
//
// The new `displace` attribute (1 or 0) tells chunk.vert.glsl which
// vertices to actually sample-and-displace: the top surface and the
// skirt walls' own top edge (which shares the top surface's exact uv at
// that boundary, so it moves by the identical amount and never opens a
// seam), versus the walls' bottom edge and the bottom cap, which stay
// fixed at baseDepth and never move, same as before this change.
//
// `heightScale` is independent of `resolution` (Dana, 2026-09-23 — see
// density.ts's own note; the same fix applies here). `size` is the
// footprint's world-space width/depth, also independent of `resolution` —
// resolution only controls how finely that fixed-size footprint is
// subdivided (Dana, 2026-09-23: "the res should affect detail level, not size").
export function buildSmoothChunkGeometry(resolution: number, size: number): THREE.BufferGeometry {
  const cellSize = size / resolution; // world units per voxel column
  const horizontalOffset = resolution / 2;

  // y is a placeholder (0) for every displaced vertex — the shader sets the
  // real height from the heightmap, this geometry only carries where a
  // vertex sits in x/z and whether it should be displaced at all.
  function topPoint(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3((x - horizontalOffset) * cellSize, 0, (z - horizontalOffset) * cellSize);
  }
  // The base sits below zero rather than at it. Terrain height clamps at
  // zero above, so with a base at zero too, every flat-bottomed area put the
  // top surface and the base cap at exactly the same depth. The GPU then has
  // no way to tell which is in front and the surface speckles, which showed
  // up as flickering dark patches across the low ground (Dana, 2026-10-13).
  // A slab with real thickness keeps the two apart.
  // TODO(DS): arbitrary placeholder thickness, as a fraction of the footprint.
  const baseDepth = -size * 0.05;
  function bottomPoint(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3((x - horizontalOffset) * cellSize, baseDepth, (z - horizontalOffset) * cellSize);
  }
  // The top surface's real per-vertex normal can no longer be derived here
  // at all — its height isn't known until the vertex shader samples the
  // heightmap. (0,1,0) is just a placeholder; chunk.frag.glsl rebuilds the
  // real, slope-aware normal itself from the same heightmap's gradient,
  // for every displaced fragment, at the texture's own resolution rather
  // than this mesh's vertex density — see chunk.vert.glsl/chunk.frag.glsl.
  const UP = new THREE.Vector3(0, 1, 0);

  const positions: number[] = [];
  const normals: number[] = [];
  // Matches sampleChunkElevation's old normalization (x/resolution,
  // z/resolution) convention — shared by the elevation-color ramp and the
  // cast-shadow march, both of which need to read the raw heightmap at an
  // arbitrary point, not just at a vertex. See landChunk.ts and
  // shaders/terrain/terrain.glsl.
  const uvs: number[] = [];
  // 1 = chunk.vert.glsl samples the heightmap and displaces this vertex
  // (the top surface, and the skirt walls' own top edge); 0 = stays fixed
  // at whatever y this geometry already gives it (the walls' bottom edge,
  // the bottom cap).
  const displaceFlags: number[] = [];
  // 1 for every vertex of a top-surface triangle, 0 for every vertex of a
  // wall or cap triangle — unlike `displace`, never mixed within one
  // triangle, so chunk.frag.glsl can pick a color source by this with no
  // interpolation seam (a wall's own top edge still needs displace=1 for
  // positioning, but isTopSurface=0 for coloring — two different
  // questions). See ISSUES.md, [B32].
  const topSurfaceFlags: number[] = [];
  function uvAt(x: number, z: number): [number, number] {
    return [x / resolution, z / resolution];
  }
  function pushTriangle(
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    n0: THREE.Vector3,
    n1: THREE.Vector3,
    n2: THREE.Vector3,
    uv0: [number, number],
    uv1: [number, number],
    uv2: [number, number],
    d0: number,
    d1: number,
    d2: number,
    isTop: number,
  ) {
    positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    normals.push(n0.x, n0.y, n0.z, n1.x, n1.y, n1.z, n2.x, n2.y, n2.z);
    uvs.push(...uv0, ...uv1, ...uv2);
    displaceFlags.push(d0, d1, d2);
    topSurfaceFlags.push(isTop, isTop, isTop);
  }
  // The bottom cap doesn't correspond to any one heightmap texel — (0, 0)
  // is an arbitrary but harmless choice, same reasoning as giving it a flat
  // shared normal.
  const NO_UV: [number, number] = [0, 0];
  function pushFlatCapQuad(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, normal: THREE.Vector3) {
    pushTriangle(p0, p1, p2, normal, normal, normal, NO_UV, NO_UV, NO_UV, 0, 0, 0, 0);
    pushTriangle(p0, p2, p3, normal, normal, normal, NO_UV, NO_UV, NO_UV, 0, 0, 0, 0);
  }
  // A skirt-wall quad: its *top* two points sit on the top surface's own
  // edge, so they carry that same real uv and get displaced identically,
  // never opening a seam against the surface they're meant to meet; its
  // *bottom* two points stay fixed at baseDepth (displace=0), same as the
  // cap, but carry their own column's real uv too, not the placeholder
  // corner — a bottom vertex interpolating toward (0,0) made the fragment
  // shader's sampled point slide diagonally across the whole heightmap as
  // it went down the wall, reading unrelated elevation values and cycling
  // the color ramp into repeated stripes (Dana, 2026-10-18: "why does the
  // chunk have layers"). Keeping the real uv constant top-to-bottom locks
  // sampling to this one column's actual height the whole way down, no
  // drift, just no displacement or a terrain-accurate normal there, which
  // is already handled separately by `displace`.
  function pushWallQuad(
    topA: THREE.Vector3,
    topB: THREE.Vector3,
    bottomB: THREE.Vector3,
    bottomA: THREE.Vector3,
    uvA: [number, number],
    uvB: [number, number],
    normal: THREE.Vector3,
  ) {
    pushTriangle(topA, topB, bottomB, normal, normal, normal, uvA, uvB, uvB, 1, 1, 0, 0);
    pushTriangle(topA, bottomB, bottomA, normal, normal, normal, uvA, uvB, uvA, 1, 0, 0, 0);
  }

  // Top surface — every vertex displaced, winding verified via the
  // right-hand-rule cross product to give a +Y-dominant placeholder normal.
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      const a = topPoint(x, z);
      const b = topPoint(x + 1, z);
      const c = topPoint(x, z + 1);
      const d = topPoint(x + 1, z + 1);
      const uvA = uvAt(x, z);
      const uvB = uvAt(x + 1, z);
      const uvC = uvAt(x, z + 1);
      const uvD = uvAt(x + 1, z + 1);
      pushTriangle(a, c, b, UP, UP, UP, uvA, uvC, uvB, 1, 1, 1, 1);
      pushTriangle(b, c, d, UP, UP, UP, uvB, uvC, uvD, 1, 1, 1, 1);
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
    pushWallQuad(topPoint(x1, z1), topPoint(x2, z2), bottomPoint(x2, z2), bottomPoint(x1, z1), uvAt(x1, z1), uvAt(x2, z2), outward);
  }

  // Bottom cap, normal (0,-1,0) — flat, no subdivision needed.
  pushFlatCapQuad(
    bottomPoint(0, 0),
    bottomPoint(resolution, 0),
    bottomPoint(resolution, resolution),
    bottomPoint(0, resolution),
    new THREE.Vector3(0, -1, 0),
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute('displace', new THREE.BufferAttribute(new Float32Array(displaceFlags), 1));
  geometry.setAttribute('isTopSurface', new THREE.BufferAttribute(new Float32Array(topSurfaceFlags), 1));
  return geometry;
}
