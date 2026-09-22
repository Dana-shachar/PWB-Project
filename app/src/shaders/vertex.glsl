varying vec2 vUv;

uniform sampler2D uHeightMap;
uniform float uDisplacementAmplitude;

void main() {
  vUv = uv;

  // Sphere UVs are equirectangular by default in Three.js, so sampling
  // directly with `uv` lines up correctly with no extra mapping.
  float height = texture2D(uHeightMap, uv).r; // 0..1, see heightmap.frag.glsl
  // TODO(DS): arbitrary placeholder amplitude default — recenter around
  // 0.5 so mid-gray means "no displacement", not "displaced by half".
  vec3 displaced = position + normal * (height - 0.5) * uDisplacementAmplitude;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
