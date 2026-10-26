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

void main() {
  vNormal = normalMatrix * normal;
  vUv = uv;
  vDisplace = displace;
  vIsTopSurface = isTopSurface;

  vec3 displacedPosition = position;
  if (displace > 0.5) {
    // Clamped at 0 (not just scaled), matching smoothMesh.ts's old CPU
    // formula exactly — the skirt walls below assume the top surface never
    // dips below the slab's own base.
    vec2 textureUv = uBakeSamples > 0.5
      ? (vec2(uBorderTexels + 0.5) + uv * (uBakeSamples - 1.0)) / (uBakeSamples + 2.0 * uBorderTexels)
      : uv;
    vec4 heightTexel = texture2D(uHeightMap, textureUv);
    float elevationRaw = mix(heightTexel.r, heightTexel.g, uHeightMapGreenChannel);
    float heightNormalized = max(0.0, elevationRaw + 0.5);
    displacedPosition.y = heightNormalized * uMaxHeight;
  }

  vWorldPosition = (modelMatrix * vec4(displacedPosition, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
}
