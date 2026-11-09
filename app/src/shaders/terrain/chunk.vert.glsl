// Passes the mesh's own normal through to chunk.frag.glsl, in world terms so
// the shared light direction means the same thing here as on the planet.
// Voxel mode's geometry already carries its real heights baked in (no
// displacement needed, see voxel/meshWorker.ts). The smooth/shaded mode's
// own geometry (voxel/smoothMesh.ts) is built flat instead, with a
// `displace` attribute marking which vertices this shader should actually
// sample-and-displace — the same vertex-texture-fetch technique
// vertex.glsl already uses for the planet, so the chunk's displayed detail
// is the heightmap texture's own resolution, not this mesh's vertex count
// or any CPU-readback cost (see ISSUES.md, [B32]).
attribute float displace;
// 1 for every vertex of a top-surface triangle, 0 for every vertex of a
// wall/cap triangle — unlike `displace`, never mixed within one triangle
// (smoothMesh.ts), so chunk.frag.glsl can pick a color source by this with
// no interpolation seam. See ISSUES.md, [B32].
attribute float isTopSurface;

varying vec3 vNormal;
varying vec3 vWorldPosition;
// Lines up with the heightmap texture built in landChunk.ts — only the
// smooth top surface (and the skirt walls' own top edge) carries a real
// value (see smoothMesh.ts); the walls' bottom edge and the bottom cap
// carry (0, 0), which is harmless since they don't need elevation-based
// color or shadow.
varying vec2 vUv;
// 1 where this fragment came from a displaced (real-height) vertex, 0
// where it's one of the fixed, never-displaced vertices — chunk.frag.glsl
// only rebuilds a slope-aware normal from the heightmap's own gradient
// where this is 1, the walls/cap keep their own flat vertex normal.
varying float vDisplace;
varying float vIsTopSurface;

uniform sampler2D uHeightMap;
uniform float uHeightBase; // drawn height = (raw + uHeightBase) * uMaxHeight; the chunk's lowest ground sits at 0
uniform float uMaxHeight; // world-unit height a raw value of 0.5 displaces to, same convention smoothMesh.ts used to bake directly
// true (1.0) for smooth mode's heightMap: the planet's own GPU bake format,
// elevation in the green channel, handed across directly now that both
// panes share one renderer (scene/sharedViewportRenderer.ts). false (0.0)
// for voxel mode's: a plain single-channel CPU texture, elevation in red,
// its own separate, accepted ceiling. See landChunk.ts, ISSUES.md [B32].
uniform float uHeightMapGreenChannel;
// A patch's bake size and border; 0 samples (the voxel mesh) reads uv as is.
uniform float uBakeSamples;
uniform float uBorderTexels;
// The distance range over which a patch blends into its next-coarser level (voxel/chunkPatches.ts morphRange): 0 at
// uMorphStart, 1 at uMorphEnd, so where it meets a coarser neighbor it already has that neighbor's surface.
uniform float uMorphStart;
uniform float uMorphEnd;
uniform sampler2D uChunkLakeLevels; // voxel/chunkLakes.ts: R is the lake level per cell, -1000 off every lake
uniform float uLakeCells; // the lake map's width in cells
uniform float uChunkSize; // world units the whole chunk spans

// A lake's shore never stands below its water: the ground beside a lake is lifted to just above the level, as Unreal's
// lake bodies shape the landscape to meet the water. The lakes are solved on a coarser map, so the finer drawn ground
// could otherwise dip below a rim and let the water stand in the air (measured up to 101 m).
float lakeRim(vec2 worldXZ, float elevationRaw) {
  if (uLakeCells < 2.0) return elevationRaw;
  vec2 cell = floor((worldXZ / uChunkSize + 0.5) * (uLakeCells - 1.0) + 0.5);
  float own = texture2D(uChunkLakeLevels, (cell + 0.5) / uLakeCells).r;
  if (own > -999.0) return elevationRaw;
  float rim = elevationRaw;
  float lift = 0.5 / max(uMaxHeight * 1000.0, 1e-6); // half a meter above the water, so the two never z-fight
  for (int k = 0; k < 4; k++) {
    vec2 offset = k == 0 ? vec2(1.0, 0.0) : k == 1 ? vec2(-1.0, 0.0) : k == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
    float level = texture2D(uChunkLakeLevels, (cell + offset + 0.5) / uLakeCells).r;
    if (level > -999.0) rim = max(rim, level + lift);
  }
  return rim;
}
varying float vMorph; // the blend, for chunk.frag.glsl's shading

const float MESH_CELLS = 64.0; // PATCH_GRID in planet/patch.ts

vec2 patchTextureUv(vec2 patchUv) {
  return (vec2(uBorderTexels + 0.5) + patchUv * (uBakeSamples - 1.0)) / (uBakeSamples + 2.0 * uBorderTexels);
}

// The next-coarser level's surface at this vertex (blue): its own height where the two grids share a vertex, the
// average of the coarse vertices around an in-between one, so a fully blended patch matches the coarse mesh's shape
// (Asirvatham and Hoppe, GPU Gems 2 ch. 2: zc averages the coarse edge's two samples; CDLOD's morph does the same).
float coarserSurface(vec2 patchUv) {
  vec2 odd = mod(floor(patchUv * MESH_CELLS + 0.5), 2.0);
  vec2 low = patchUv - odd / MESH_CELLS;
  vec2 high = patchUv + odd / MESH_CELLS;
  return 0.25 * (
    texture2D(uHeightMap, patchTextureUv(low)).b + texture2D(uHeightMap, patchTextureUv(vec2(high.x, low.y))).b +
    texture2D(uHeightMap, patchTextureUv(vec2(low.x, high.y))).b + texture2D(uHeightMap, patchTextureUv(high)).b);
}

void main() {
  // World space, to match the sun and view directions ([B61], fixed 2026-10-27; normalMatrix gave view space).
  vNormal = mat3(modelMatrix) * normal;
  vUv = uv;
  vDisplace = displace;
  vIsTopSurface = isTopSurface;

  vec3 displacedPosition = position;
  vMorph = 0.0;
  if (displace > 0.5) {
    // Clamped at 0 (not just scaled), matching smoothMesh.ts's old CPU
    // formula exactly — the skirt walls below assume the top surface never
    // dips below the slab's own base.
    vec2 textureUv = uBakeSamples > 0.5
      ? (vec2(uBorderTexels + 0.5) + uv * (uBakeSamples - 1.0)) / (uBakeSamples + 2.0 * uBorderTexels)
      : uv;
    vec4 heightTexel = texture2D(uHeightMap, textureUv);
    float elevationRaw = mix(heightTexel.r, heightTexel.g, uHeightMapGreenChannel);
    if (uBakeSamples > 0.5 && uMorphEnd > uMorphStart) {
      // Blended by this vertex's own distance to the eye, measured at the coarse surface's height so both sides of a
      // shared edge measure the same point (CDLOD: the distance function must agree across neighbors).
      float coarse = coarserSurface(uv);
      vec3 coarsePoint = (modelMatrix * vec4(position.x, max(0.0, coarse + uHeightBase) * uMaxHeight, position.z, 1.0)).xyz;
      vMorph = clamp((distance(cameraPosition, coarsePoint) - uMorphStart) / (uMorphEnd - uMorphStart), 0.0, 1.0);
      elevationRaw = mix(elevationRaw, coarse, vMorph);
    }
    elevationRaw = lakeRim((modelMatrix * vec4(position, 1.0)).xz, elevationRaw);
    float heightNormalized = max(0.0, elevationRaw + uHeightBase);
    displacedPosition.y = heightNormalized * uMaxHeight;
  }

  vWorldPosition = (modelMatrix * vec4(displacedPosition, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
}
