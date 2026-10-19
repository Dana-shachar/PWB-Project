varying vec2 vUv;
// The vertex's own undisplaced direction on the sphere. Unlike vUv this is
// continuous everywhere — no seam, no poles — so fragment.glsl can rebuild
// its tangent basis from this instead of from UV. See ISSUES.md,
// "Planet Mesh / Adaptive Resolution".
varying vec3 vSphereDirection;
// World-space position of the displaced surface, for the specular term's
// view direction (Blinn-Phong needs both the light and the eye).
varying vec3 vWorldPosition;

uniform sampler2D uHeightMap;
uniform float uDisplacementAmplitude;

void main() {
  vUv = uv;
  vec3 sphereDirection = normalize(position);
  vSphereDirection = sphereDirection;

  // G, not R — real elevation (each layer's own Height, additive, already
  // centered on 0), not the R shape/paint composite (0..1, centered on 0.5)
  // the 2D canvas shows. See heightmap.frag.glsl and ISSUES.md, 2026-09-24.
  float elevation = texture2D(uHeightMap, uv).g;
  vec3 displaced = position + normal * elevation * uDisplacementAmplitude;

  vWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
