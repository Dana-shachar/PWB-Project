// The erosion filter in 3D, on the sphere: branching gullies and ridges laid on a smooth base height, evaluated per
// point so patches stay seamless. Rune Skovbo Johansen's Advanced Terrain Erosion Filter (Shadertoy wXcfWn, read
// 2026-11-03), with Estqes's 3D Phacelle noise from 3D-Erosion-Filter-Unity (Filter/ErosionFilter.hlsl, read
// 2026-11-03). Parameters are bevy_erosion_filter's defaults, which match Rune's demo. Rune's 2D slope vectors become
// 3D vectors in the plane tangent to the sphere, as Estqes's port does; the ridge map output is left out.
//
// Original GLSL version copyright (c) 2025 Rune Skovbo Johansen
// HLSL port and 3D adaptation by Estqes, 2026
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

#define EROSION_TAU 6.28318530717959

// Estqes's hash33.
vec3 erosionHash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// Estqes's 3D PhacelleNoise: a stripe pattern across dir, in the surface with this normal, blended over 3x3x3 cells.
// Returns the normalized cosine and sine waves; sideDir is the stripes' cross direction, scaled by frequency.
vec2 erosionPhacelle(vec3 p, vec3 dir, vec3 normal, float freq, float offset, float normalization, out vec3 sideDir) {
  sideDir = cross(dir, normal) * freq * EROSION_TAU;
  offset *= EROSION_TAU;
  vec3 pInt = floor(p + 0.5);
  vec3 pFract = p - pInt;
  vec2 phaseDir = vec2(0.0);
  float weightSum = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      for (int z = -1; z <= 1; z++) {
        vec3 gridOffset = vec3(float(x), float(y), float(z));
        vec3 randomOffset = normalize(erosionHash33(pInt + gridOffset)) * 0.295;
        vec3 fromCell = pFract - gridOffset - randomOffset;
        float weight = max(0.0, exp(-dot(fromCell, fromCell) * 2.0) - 0.1111);
        if (weight > 0.0) {
          weightSum += weight;
          float waveInput = dot(fromCell, sideDir) + offset;
          phaseDir += vec2(cos(waveInput), sin(waveInput)) * weight;
        }
      }
    }
  }
  vec2 interpolated = phaseDir / max(weightSum, 0.00001);
  float magnitude = max(1.0 - normalization, length(interpolated));
  return interpolated / magnitude;
}

float erosionClamp01(float t) { return clamp(t, 0.0, 1.0); }
float erosionPowInv(float t, float power) { return 1.0 - pow(1.0 - erosionClamp01(t), power); }
float erosionEaseOut(float t) {
  float v = 1.0 - erosionClamp01(t);
  return 1.0 - v * v;
}
float erosionSmoothStart(float t, float smoothing) {
  if (t >= smoothing) return t - 0.5 * smoothing;
  return 0.5 * t * t / smoothing;
}
vec3 erosionSafeNormalize(vec3 n) {
  float l = length(n);
  return l > 1e-10 ? n / l : n;
}

// Rune's ErosionFilter, height only, in his demo's units: pos and scale horizontal, slope the base's gradient in the
// tangent plane, fadeTarget -1 at valleys and 1 at peaks. Returns the height change in the same units.
float erosionFilter3d(vec3 pos, vec3 normal, vec3 slope, float fadeTarget, float strength, float scale, float gullyWeight, float detail) {
  // bevy_erosion_filter's defaults (Rune's demo, unanimated); gully weight and detail come from the Erosion panel.
  const vec4 ROUNDING = vec4(0.1, 0.0, 0.1, 2.0);
  const vec4 ONSET = vec4(1.25, 1.25, 2.8, 1.5);
  const vec2 ASSUMED_SLOPE = vec2(0.7, 1.0);
  const float CELL_SCALE = 0.7;
  const float NORMALIZATION = 0.5;
  const int OCTAVES = 5;
  const float LACUNARITY = 2.0;
  const float GAIN = 0.5;

  strength *= scale;
  fadeTarget = clamp(fadeTarget, -1.0, 1.0);
  float freq = 1.0 / (scale * CELL_SCALE);
  float slopeLength = max(length(slope), 1e-10);
  float heightDelta = 0.0;
  float roundingMult = 1.0;
  float roundingForInput = mix(ROUNDING.y, ROUNDING.x, erosionClamp01(fadeTarget + 0.5)) * ROUNDING.z;
  float combiMask = erosionEaseOut(erosionSmoothStart(slopeLength * ONSET.x, roundingForInput * ONSET.x));
  vec3 gullySlope = mix(slope, slope / slopeLength * ASSUMED_SLOPE.x, ASSUMED_SLOPE.y);

  for (int i = 0; i < OCTAVES; i++) {
    vec3 sideDir;
    vec2 phacelle = erosionPhacelle(pos * freq, erosionSafeNormalize(gullySlope), normal, CELL_SCALE, 0.25, NORMALIZATION, sideDir);
    sideDir *= -freq; // p was multiplied by freq; slope directions point down
    float sloping = abs(phacelle.y);
    gullySlope += sign(phacelle.y) * sideDir * strength * gullyWeight;
    float fadedGully = mix(fadeTarget, phacelle.x * gullyWeight, combiMask);
    heightDelta += fadedGully * strength;
    fadeTarget = fadedGully;
    float roundingForOctave = mix(ROUNDING.y, ROUNDING.x, erosionClamp01(phacelle.x + 0.5)) * roundingMult;
    float newMask = erosionEaseOut(erosionSmoothStart(sloping * ONSET.y, roundingForOctave * ONSET.y));
    combiMask = erosionPowInv(combiMask, detail) * newMask;
    strength *= GAIN;
    freq *= LACUNARITY;
    roundingMult *= ROUNDING.w;
  }
  return heightDelta;
}
