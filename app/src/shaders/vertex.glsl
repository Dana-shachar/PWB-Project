varying vec2 vUv;

uniform sampler2D uHeightMap;
uniform float uDisplacementAmplitude;

void main() {
  vUv = uv;

  // Sphere UVs are equirectangular by default in Three.js, so sampling
  // directly with `uv` lines up correctly with no extra mapping. G, not R —
  // real elevation (each layer's own Height, additive, already centered on
  // 0), not the R shape/paint composite (0..1, centered on 0.5) the 2D
  // canvas shows. See heightmap.frag.glsl and ISSUES.md, 2026-09-24.
  float elevation = texture2D(uHeightMap, uv).g;
  vec3 displaced = position + normal * elevation * uDisplacementAmplitude;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
