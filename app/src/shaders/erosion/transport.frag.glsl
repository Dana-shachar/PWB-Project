// Pass 6: carry the suspended sediment along with the water.
//
// Read backwards rather than written forwards: each cell asks where its
// sediment came from one step ago, which keeps the whole pass to a single
// write per pixel. Pushing sediment forward instead would need cells to
// write into their neighbors, which is exactly the scattered write WebGL
// handles badly and the reason this project is not droplet-based (see [S25]
// in SPEC.md).

uniform sampler2D uHeightState;
uniform sampler2D uVelocity;
uniform float uTexel;
uniform float uDeltaTime;
varying vec2 vUv;

// The four-tap blend is done here rather than left to the sampler, so this
// does not depend on float textures being filterable, which is an extension
// that is not reliably available.
float sedimentAt(vec2 uv) {
  vec2 texels = uv / uTexel - 0.5;
  vec2 base = floor(texels);
  vec2 offset = texels - base;
  vec2 lowUv = (base + 0.5) * uTexel;
  float lowerLeft = texture2D(uHeightState, clamp(lowUv, 0.0, 1.0)).b;
  float lowerRight = texture2D(uHeightState, clamp(lowUv + vec2(uTexel, 0.0), 0.0, 1.0)).b;
  float upperLeft = texture2D(uHeightState, clamp(lowUv + vec2(0.0, uTexel), 0.0, 1.0)).b;
  float upperRight = texture2D(uHeightState, clamp(lowUv + vec2(uTexel, uTexel), 0.0, 1.0)).b;
  return mix(mix(lowerLeft, lowerRight, offset.x), mix(upperLeft, upperRight, offset.x), offset.y);
}

void main() {
  vec4 state = texture2D(uHeightState, vUv);
  vec2 velocity = texture2D(uVelocity, vUv).rg;
  // Velocity is in cells per unit time, so one step back is that many cells.
  vec2 source = vUv - velocity * uDeltaTime * uTexel;
  gl_FragColor = vec4(state.r, state.g, sedimentAt(source), state.a);
}
