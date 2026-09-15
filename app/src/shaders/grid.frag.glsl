// Minor/major grid-line math ported from active-geometry-project's
// raymarched floor grid (fragment.glsl) — same fwidth-based anti-aliasing
// and distance fade, adapted to a flat plane instead of a ray/floor
// intersection (geometry already places us at y=0).

varying vec3 vWorldPosition;

uniform float uMinorSpacing;
uniform float uFadeDistance;

void main() {
  vec2 gridCoord = vWorldPosition.xz;
  float majorSpacing = uMinorSpacing * 10.0;

  vec2 minorDeriv = fwidth(gridCoord / uMinorSpacing);
  vec2 minorGrid = abs(fract(gridCoord / uMinorSpacing - 0.5) - 0.5) / minorDeriv;
  float minorLine = 1.0 - min(min(minorGrid.x, minorGrid.y), 1.0);
  minorLine *= clamp(1.0 - max(minorDeriv.x, minorDeriv.y) * 2.0, 0.0, 1.0);

  vec2 majorDeriv = fwidth(gridCoord / majorSpacing);
  vec2 majorGrid = abs(fract(gridCoord / majorSpacing - 0.5) - 0.5) / majorDeriv;
  float majorLine = 1.0 - min(min(majorGrid.x, majorGrid.y), 1.0);
  majorLine *= clamp(1.0 - max(majorDeriv.x, majorDeriv.y) * 2.0, 0.0, 1.0);

  float gridIntensity = clamp(minorLine * 0.2 + majorLine * 0.3, 0.0, 0.3);
  // `cameraPosition` is a built-in Three.js ShaderMaterial uniform.
  float dist = distance(cameraPosition, vWorldPosition);
  float gridFade = clamp(1.0 - dist / uFadeDistance, 0.0, 1.0);

  gl_FragColor = vec4(vec3(1.0), gridIntensity * gridFade);
}
