// Pass 7: evaporate, which is what ends a run rather than letting water
// accumulate forever. Sediment is left where it is, so a drying cell drops
// its load through the erode/deposit pass on the next step.

uniform sampler2D uHeightState;
uniform float uDeltaTime;
uniform float uEvaporationRate;
varying vec2 vUv;

void main() {
  vec4 state = texture2D(uHeightState, vUv);
  float water = state.g * max(0.0, 1.0 - uEvaporationRate * uDeltaTime);
  gl_FragColor = vec4(state.r, water, state.b, state.a);
}
