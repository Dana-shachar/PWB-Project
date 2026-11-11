// One step of the life grid (biome/lifeGrid.ts), Cordonnier et al. 2017's ecosystem event per cell, for the pioneer types
// (aggregated like their grass): viability by a hat function per input, the worst one wins (Liebig's law); germination by
// vigor into free space, death by stress; dead matter to humus at 30% (Sitch et al. 2003, via Cordonnier).
// State: R algae, G moss (coverage 0 to 1), B humus, A this step's dead matter.
uniform sampler2D uState;
uniform sampler2D uInputs; // lifeInputs.frag.glsl: temperature, moisture, sunlight
uniform vec4 uAlgaeTemperature; // survival min, ideal min, ideal max, survival max
uniform vec4 uAlgaeMoisture;
uniform vec4 uAlgaeSun;
uniform vec4 uMossTemperature;
uniform vec4 uMossMoisture;
uniform vec4 uMossSun;
uniform float uGrowthRate; // coverage gained per year at full vigor into fully free ground
uniform float uDeathRate; // coverage lost per year at full stress
uniform float uYears; // years this step stands for (1, more on a long jump)
varying vec2 vUv;

const float HUMUS_SHARE = 0.3;

// Cordonnier's piece-wise linear hat: -1 outside survival, 1 in the ideal range, linear between.
float hat(float c, vec4 range) {
  if (c < range.x || c > range.w) return -1.0;
  if (c < range.y) return (c - range.x) / max(range.y - range.x, 1e-4);
  if (c > range.z) return (range.w - c) / max(range.w - range.z, 1e-4);
  return 1.0;
}

float viability(vec3 inputs, vec4 temperature, vec4 moisture, vec4 sun) {
  return min(hat(inputs.x, temperature), min(hat(inputs.y, moisture), hat(inputs.z, sun)));
}

void main() {
  vec4 state = texture2D(uState, vUv);
  vec4 inputs4 = texture2D(uInputs, vUv);
  vec3 inputs = inputs4.xyz;
  float freeSpace = max(1.0 - state.r - state.g, 0.0);
  // Algae is aquatic: it reads the waterline's wetness alone, never rain or hollows, so it stays in and by the water.
  float algaeV = viability(vec3(inputs.x, inputs4.a, inputs.z), uAlgaeTemperature, uAlgaeMoisture, uAlgaeSun);
  float mossV = viability(inputs, uMossTemperature, uMossMoisture, uMossSun);

  float algaeLoss = min(state.r, uDeathRate * max(-algaeV, 0.0) * state.r * uYears);
  float mossLoss = min(state.g, uDeathRate * max(-mossV, 0.0) * state.g * uYears);
  float algaeGain = min(freeSpace, uGrowthRate * max(algaeV, 0.0) * freeSpace * uYears);
  float mossGain = min(freeSpace, uGrowthRate * max(mossV, 0.0) * freeSpace * uYears);
  // Both share the same free space: split it by their gains when together they'd overfill it.
  float totalGain = algaeGain + mossGain;
  float fit = totalGain > freeSpace ? freeSpace / totalGain : 1.0;

  float algae = clamp(state.r - algaeLoss + algaeGain * fit, 0.0, 1.0);
  float moss = clamp(state.g - mossLoss + mossGain * fit, 0.0, 1.0);
  float dead = algaeLoss + mossLoss;
  float humus = state.b + dead * HUMUS_SHARE;
  gl_FragColor = vec4(algae, moss, humus, dead);
}
