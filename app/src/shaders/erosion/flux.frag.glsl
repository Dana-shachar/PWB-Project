// Pass 2: update the outflow through each of a cell's four virtual pipes.
//
// A pipe accelerates on the difference in water surface height across it, so
// water runs downhill on its own rather than being pushed by a rule. This is
// the step that makes the model a shallow-water one rather than a heuristic.

uniform sampler2D uHeightState;
uniform sampler2D uFluxState;
uniform float uTexel;
uniform float uDeltaTime;
uniform float uSeaLevel; // already in cell units, converted by the engine
varying vec2 vUv;

void main() {
  vec4 state = texture2D(uHeightState, vUv);
  vec4 flux = texture2D(uFluxState, vUv);
  float surface = state.r + state.g;

  vec2 left = vUv + vec2(-uTexel, 0.0);
  vec2 right = vUv + vec2(uTexel, 0.0);
  vec2 up = vUv + vec2(0.0, uTexel);
  vec2 down = vUv + vec2(0.0, -uTexel);

  // What lies just outside the patch: the sea where the ground is below it,
  // otherwise bare ground. Rain still runs off the edge, but the sea stays
  // where it is instead of pouring away into nothing.
  float outside = max(state.r, uSeaLevel);

  // The max against zero is what stops a pipe running uphill.
  float outLeft = max(0.0, flux.r + uDeltaTime * GRAVITY * (surface - neighborSurface(uHeightState, left, outside)));
  float outRight = max(0.0, flux.g + uDeltaTime * GRAVITY * (surface - neighborSurface(uHeightState, right, outside)));
  float outUp = max(0.0, flux.b + uDeltaTime * GRAVITY * (surface - neighborSurface(uHeightState, up, outside)));
  float outDown = max(0.0, flux.a + uDeltaTime * GRAVITY * (surface - neighborSurface(uHeightState, down, outside)));

  // A cell cannot send out more water than it holds, so all four pipes are
  // scaled back together when between them they would. Without this the
  // depth goes negative and the whole field blows up within a few steps.
  float total = outLeft + outRight + outUp + outDown;
  if (total > 0.0) {
    float scale = min(1.0, state.g / (total * uDeltaTime)); // cell area is 1
    outLeft *= scale;
    outRight *= scale;
    outUp *= scale;
    outDown *= scale;
  }

  gl_FragColor = vec4(outLeft, outRight, outUp, outDown);
}
