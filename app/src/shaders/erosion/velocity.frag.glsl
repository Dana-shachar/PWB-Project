// Pass 4: the flow velocity field, read off the flux that just moved.
//
// This is what the erosion step needs: how fast the water is going, not just
// how much of it there is. Fast shallow water cuts; slow deep water drops
// what it carries.

uniform sampler2D uHeightState;
uniform sampler2D uFluxState;
uniform float uTexel;
varying vec2 vUv;

void main() {
  vec4 state = texture2D(uHeightState, vUv);
  vec4 flux = texture2D(uFluxState, vUv);

  vec2 left = vUv + vec2(-uTexel, 0.0);
  vec2 right = vUv + vec2(uTexel, 0.0);
  vec2 up = vUv + vec2(0.0, uTexel);
  vec2 down = vUv + vec2(0.0, -uTexel);

  // The net water crossing the cell on each axis, averaged over its two
  // opposite pipes.
  float acrossX = 0.5 * ((inflowFrom(uFluxState, left, 1) - flux.r) + (flux.g - inflowFrom(uFluxState, right, 0)));
  float acrossY = 0.5 * ((inflowFrom(uFluxState, down, 2) - flux.a) + (flux.b - inflowFrom(uFluxState, up, 3)));

  // The mean depth across the step, written into A by the water pass.
  float depth = state.a;
  vec2 velocity = depth < MIN_WATER ? vec2(0.0) : vec2(acrossX, acrossY) / depth;
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
