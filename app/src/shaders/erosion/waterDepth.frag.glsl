// Pass 3: apply the flux, giving each cell its new water depth.

uniform sampler2D uHeightState;
uniform sampler2D uFluxState;
uniform float uTexel;
uniform float uDeltaTime;
varying vec2 vUv;

void main() {
  vec4 state = texture2D(uHeightState, vUv);
  vec4 flux = texture2D(uFluxState, vUv);

  vec2 left = vUv + vec2(-uTexel, 0.0);
  vec2 right = vUv + vec2(uTexel, 0.0);
  vec2 up = vUv + vec2(0.0, uTexel);
  vec2 down = vUv + vec2(0.0, -uTexel);

  float arriving =
    inflowFrom(uFluxState, left, 1) + // the left neighbor's right pipe
    inflowFrom(uFluxState, right, 0) + // the right neighbor's left pipe
    inflowFrom(uFluxState, up, 3) + // the upper neighbor's down pipe
    inflowFrom(uFluxState, down, 2); // the lower neighbor's up pipe
  float leaving = flux.r + flux.g + flux.b + flux.a;

  float before = state.g;
  float after = max(0.0, before + uDeltaTime * (arriving - leaving)); // cell area is 1

  // A carries the mean depth across this step, which is what the velocity
  // pass needs and what lets every pass keep to a single output. Taking the
  // new depth alone instead makes velocity spike wherever a cell has just
  // drained. See erosion/erosionEngine.ts on why no pass writes two targets.
  gl_FragColor = vec4(state.r, after, state.b, (before + after) * 0.5);
}
