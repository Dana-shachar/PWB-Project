// Pass 5: erode or deposit, by comparing what the water carries against
// what it is able to carry.
//
// Capacity rises with both slope and speed, so steep fast water lifts
// terrain into itself and anything slower drops it back. Those two rates are
// separate controls on purpose: one governs how fast rock is taken up, the
// other how fast it settles, and together they are what makes valleys rather
// than uniform lowering.

uniform sampler2D uHeightState;
uniform sampler2D uVelocity;
uniform float uTexel;
uniform float uDeltaTime;
uniform float uSedimentCapacity;
uniform float uErosionRate;
uniform float uDepositionRate;
varying vec2 vUv;

float terrainAt(vec2 uv) {
  return texture2D(uHeightState, clamp(uv, 0.0, 1.0)).r;
}

void main() {
  vec4 state = texture2D(uHeightState, vUv);
  vec2 velocity = texture2D(uVelocity, vUv).rg;

  // The slope, as a central difference over one cell each way.
  vec2 gradient = 0.5 * vec2(
    terrainAt(vUv + vec2(uTexel, 0.0)) - terrainAt(vUv - vec2(uTexel, 0.0)),
    terrainAt(vUv + vec2(0.0, uTexel)) - terrainAt(vUv - vec2(0.0, uTexel))
  );
  float slope = length(gradient);
  // Capped, not floored: capacity rises with slope, and an uncapped cliff
  // asks to carry unlimited sediment.
  float sinTilt = min(MAX_TILT, slope / sqrt(1.0 + slope * slope));

  // How much of its full load this depth of water can carry: nothing on dry
  // ground, rising to all of it once the water is deep. This is what stops a
  // barely wet cell, whose velocity is flow divided by a tiny depth and so
  // reads as enormous, from lifting more rock than is there.
  float depthFactor = clamp(1.0 - max(0.0, MAX_EROSION_DEPTH - state.g) / MAX_EROSION_DEPTH, 0.0, 1.0);

  float capacity = uSedimentCapacity * sinTilt * length(velocity) * depthFactor;

  float terrain = state.r;
  float sediment = state.b;
  if (sediment < capacity) {
    // Never lift past capacity in one step, however high the rate is set.
    float lifted = min(uErosionRate * (capacity - sediment) * uDeltaTime, capacity - sediment);
    terrain -= lifted;
    sediment += lifted;
  } else {
    float dropped = min(uDepositionRate * (sediment - capacity) * uDeltaTime, sediment);
    terrain += dropped;
    sediment -= dropped;
  }

  gl_FragColor = vec4(terrain, state.g, max(0.0, sediment), state.a);
}
