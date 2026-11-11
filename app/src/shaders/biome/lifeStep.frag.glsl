// One step of the life grid (biome/lifeGrid.ts). Four variants of each type live side by side in every cell, each by its
// own genes against the cell's conditions, sharing its free space (JeDi-DGVM, Pavlick et al. 2013: many strategies per
// cell, trade-offs decide who survives). Each follows Cordonnier et al. 2017's event: viability by a hat function per
// input, the worst one wins (Liebig's law); germination by vigor into free space, death by stress; dead matter to humus
// at 30% (Sitch et al. 2003, via Cordonnier). Algae is aquatic and reads the waterline's wetness alone.
// Targets: algae variants (RGBA), moss variants (RGBA), soil (R humus, G this step's dead matter). One pass per target.
uniform sampler2D uAlgae;
uniform sampler2D uMoss;
uniform sampler2D uSoil;
uniform sampler2D uInputs; // lifeInputs.frag.glsl: temperature, moisture, sunlight, waterline
uniform vec4 uAlgaeTemperature; // survival min, ideal min, ideal max, survival max
uniform vec4 uAlgaeMoisture;
uniform vec4 uAlgaeSun;
uniform vec4 uMossTemperature;
uniform vec4 uMossMoisture;
uniform vec4 uMossSun;
// Each variant's genes as shifts of its type's ranges: moisture need (all four bounds move up) and shade need (the sun
// range moves down).
uniform vec4 uAlgaeMoistureShift;
uniform vec4 uAlgaeShadeShift;
uniform vec4 uMossMoistureShift;
uniform vec4 uMossShadeShift;
uniform float uGrowthRate; // coverage gained per year at full vigor into fully free ground
uniform float uDeathRate; // coverage lost per year at full stress
uniform float uYears; // years this step stands for (1, more on a long jump)
uniform float uOutput; // which target this pass writes: 0 algae, 1 moss, 2 soil
// 1 for a variant just replaced by a mutant: its old cover is gone, so the mutant starts from nothing and grows into the
// freed space (JeDi-DGVM: a new strategy enters small).
uniform vec4 uAlgaeCleared;
// Algae needs the shore by distance as well as by height: the nearest water's distance (lifeShore.frag.glsl), in grid UV.
uniform sampler2D uShore;
uniform float uShoreReach; // meters from the water algae can reach
uniform float uMetersPerUv;
uniform vec4 uMossCleared;
varying vec2 vUv;

const float HUMUS_SHARE = 0.3;

// Wetness by distance from water fades as the height-based one does (exp), to 5% at the reach. Shape inferred, TUNABLE.
float shoreWetness(float heightWetness, float shoreDistance, float reach, float metersPerUv) {
  if (heightWetness >= 1.5) return heightWetness; // under water
  return min(heightWetness, exp(-3.0 * shoreDistance * metersPerUv / max(reach, 1.0)));
}

// Cordonnier's piece-wise linear hat: -1 outside survival, 1 in the ideal range, linear between.
float hat(float c, vec4 range) {
  if (c < range.x || c > range.w) return -1.0;
  if (c < range.y) return (c - range.x) / max(range.y - range.x, 1e-4);
  if (c > range.z) return (range.w - c) / max(range.w - range.z, 1e-4);
  return 1.0;
}

// The four variants' viability, each with its own moisture and shade genes.
vec4 viabilities(float temperature, float moisture, float sun, vec4 tRange, vec4 mRange, vec4 sRange, vec4 mShift, vec4 sShift) {
  float t = hat(temperature, tRange);
  vec4 v;
  for (int i = 0; i < 4; i++) {
    float m = hat(moisture, mRange + vec4(mShift[i]));
    float s = hat(sun, sRange - vec4(sShift[i]));
    v[i] = min(t, min(m, s));
  }
  return v;
}

void main() {
  vec4 algae = texture2D(uAlgae, vUv) * (1.0 - uAlgaeCleared);
  vec4 moss = texture2D(uMoss, vUv) * (1.0 - uMossCleared);
  vec4 soil = texture2D(uSoil, vUv);
  vec4 inputs = texture2D(uInputs, vUv);
  float freeSpace = max(1.0 - dot(algae, vec4(1.0)) - dot(moss, vec4(1.0)), 0.0);

  float algaeWetness = shoreWetness(inputs.a, texture2D(uShore, vUv).r, uShoreReach, uMetersPerUv);
  vec4 algaeV = viabilities(inputs.x, algaeWetness, inputs.z, uAlgaeTemperature, uAlgaeMoisture, uAlgaeSun, uAlgaeMoistureShift, uAlgaeShadeShift);
  vec4 mossV = viabilities(inputs.x, inputs.y, inputs.z, uMossTemperature, uMossMoisture, uMossSun, uMossMoistureShift, uMossShadeShift);

  vec4 algaeLoss = min(algae, uDeathRate * max(-algaeV, 0.0) * algae * uYears);
  vec4 mossLoss = min(moss, uDeathRate * max(-mossV, 0.0) * moss * uYears);
  vec4 algaeGain = min(vec4(freeSpace), uGrowthRate * max(algaeV, 0.0) * freeSpace * uYears);
  vec4 mossGain = min(vec4(freeSpace), uGrowthRate * max(mossV, 0.0) * freeSpace * uYears);
  // All variants share the same free space: split it by their gains when together they'd overfill it.
  float totalGain = dot(algaeGain, vec4(1.0)) + dot(mossGain, vec4(1.0));
  float fit = totalGain > freeSpace ? freeSpace / totalGain : 1.0;

  if (uOutput < 0.5) {
    gl_FragColor = clamp(algae - algaeLoss + algaeGain * fit, 0.0, 1.0);
  } else if (uOutput < 1.5) {
    gl_FragColor = clamp(moss - mossLoss + mossGain * fit, 0.0, 1.0);
  } else {
    float dead = dot(algaeLoss, vec4(1.0)) + dot(mossLoss, vec4(1.0));
    gl_FragColor = vec4(soil.r + dead * HUMUS_SHARE, dead, 0.0, 1.0);
  }
}
