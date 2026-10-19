// Pass 1: add water.
//
// Where the water enters is the engine's "location" parameter: everywhere for
// ordinary rainfall, or one disc for a placed event such as a flood (Stage
// 13). Only the first is reachable from the panel today, but both run through
// the same shader so a disaster is a parameter value rather than new code.

uniform sampler2D uHeightState;
uniform float uDeltaTime;
uniform float uRainfall; // already multiplied by the run's intensity
uniform float uSourceMode; // 0 everywhere, 1 a disc
uniform vec2 uSourceCenter;
uniform float uSourceRadius;
varying vec2 vUv;

void main() {
  vec4 state = texture2D(uHeightState, vUv);
  float coverage = 1.0;
  if (uSourceMode > 0.5) {
    coverage = 1.0 - smoothstep(0.0, uSourceRadius, distance(vUv, uSourceCenter));
  }
  gl_FragColor = vec4(state.r, state.g + uRainfall * coverage * uDeltaTime, state.b, state.a);
}
