// Depends on noise.glsl's noise functions — concatenated together at usage
// time in map/heightmap.ts (no #include mechanism, per the ?raw-import +
// string-concatenation approach agreed on 2026-09-02).

varying vec2 vUv;

const int MAX_LAYERS = 16; // loop upper bound — actual count is uLayerCount, via the break below

uniform float uLayerCount;
uniform float uLayerNoiseType[MAX_LAYERS]; // base generator: 0=random, 1=perlin, 2=simplex, 3=voronoi, 4=none
uniform float uLayerSeed[MAX_LAYERS];
uniform float uLayerFrequency[MAX_LAYERS];
// Modifiers — independent toggles (0/1) layered onto the base generator
// above, not separate noiseType values (Dana, 2026-09-30: "Modifiers as
// toggles, not types"). Fixed order (Gaea): Domain warp → generator/Octaves
// → Ridged → Terrace. See map/heightmap.ts's NoiseLayer.
uniform float uLayerDomainWarpOn[MAX_LAYERS];
uniform float uLayerWarpStrength[MAX_LAYERS];
uniform float uLayerOctavesOn[MAX_LAYERS];
uniform float uLayerOctaves[MAX_LAYERS];
uniform float uLayerPersistence[MAX_LAYERS];
uniform float uLayerLacunarity[MAX_LAYERS];
uniform float uLayerRidgedOn[MAX_LAYERS];
uniform float uLayerRidgeAmount[MAX_LAYERS]; // 0..1 — ridge() has no natural continuous param of its own, this blends un-ridged -> fully-ridged
uniform float uLayerTerraceOn[MAX_LAYERS];
uniform float uLayerTerraceSteps[MAX_LAYERS];
uniform float uLayerOpacity[MAX_LAYERS];
uniform float uLayerHeightScale[MAX_LAYERS]; // amplitude, distinct from opacity — see map/heightmap.ts's NoiseLayer.heightScale
uniform float uLayerBlendMode[MAX_LAYERS]; // 0=normal, 1=add, 2=subtract, 3=multiply, 4=max, 5=min, 6=screen
// Transform and detail extras, per layer (see NoiseLayer in map/heightmap.ts).
uniform vec3 uLayerOffset[MAX_LAYERS]; // noise translation, in lattice units, separate from seed
uniform vec3 uLayerStretch[MAX_LAYERS]; // per-axis frequency multiplier (Gaea Scale X/Y, Terragen stretch)
uniform float uLayerWarpScale[MAX_LAYERS];
uniform float uLayerWarpOctaves[MAX_LAYERS];
uniform float uLayerVoronoiJitter[MAX_LAYERS];
uniform float uLayerVoronoiDistance[MAX_LAYERS]; // 0=Euclidean, 1=Manhattan, 2=Chebychev
uniform float uLayerRidgeOffset[MAX_LAYERS];
uniform float uLayerRidgeGain[MAX_LAYERS];
// Fractal type inside the Octaves modifier: 0=fBm, 1=multifractal, 2=hybrid,
// 3=hetero terrain, 4=ridged multifractal, with its own Offset and Gain.
uniform float uLayerFractalType[MAX_LAYERS];
uniform float uLayerFractalOffset[MAX_LAYERS];
uniform float uLayerFractalGain[MAX_LAYERS];
// Distance between baked samples in face coordinates, 0 = no octave fade
// (the whole-globe bake and the noise canvas). Set per patch bake.
uniform float uSampleSpacing;
// Strength of the planet-wide fine detail added in patch bakes (planetDetail).
uniform float uDetailAmount;
// With water on, there is no Roughness under water, and it fades in over the coast, so it never moves the coastline.
uniform float uShoreEnabled;
uniform float uShoreSeaLevel;
// Each layer's own mask pattern: a base generator type (-1 = unmasked), its
// seed and frequency, then the brightness band that lets the layer through.
uniform float uLayerMaskType[MAX_LAYERS];
uniform float uLayerMaskSeed[MAX_LAYERS];
uniform float uLayerMaskFrequency[MAX_LAYERS];
uniform float uLayerMaskInvert[MAX_LAYERS];
uniform float uLayerMaskMin[MAX_LAYERS];
uniform float uLayerMaskMax[MAX_LAYERS];
// GLSL ES 1.00 (this material's default) requires constant indices for
// sampler arrays, so each layer gets its own named uniform instead of a
// true array — see samplePaintTexture() below.
uniform sampler2D uLayerPaintTexture0;
uniform sampler2D uLayerPaintTexture1;
uniform sampler2D uLayerPaintTexture2;
uniform sampler2D uLayerPaintTexture3;
uniform sampler2D uLayerPaintTexture4;
uniform sampler2D uLayerPaintTexture5;
uniform sampler2D uLayerPaintTexture6;
uniform sampler2D uLayerPaintTexture7;
uniform sampler2D uLayerPaintTexture8;
uniform sampler2D uLayerPaintTexture9;
uniform sampler2D uLayerPaintTexture10;
uniform sampler2D uLayerPaintTexture11;
uniform sampler2D uLayerPaintTexture12;
uniform sampler2D uLayerPaintTexture13;
uniform sampler2D uLayerPaintTexture14;
uniform sampler2D uLayerPaintTexture15;

// Selects among the 16 named paint-texture uniforms above by constant
// comparison. Returns (value, mask) — mask 0 = untouched (procedural shows
// through), mask 1 = fully painted (value replaces it).
vec2 samplePaintTexture(int index, vec2 uv) {
  if (index == 0) return texture2D(uLayerPaintTexture0, uv).rg;
  if (index == 1) return texture2D(uLayerPaintTexture1, uv).rg;
  if (index == 2) return texture2D(uLayerPaintTexture2, uv).rg;
  if (index == 3) return texture2D(uLayerPaintTexture3, uv).rg;
  if (index == 4) return texture2D(uLayerPaintTexture4, uv).rg;
  if (index == 5) return texture2D(uLayerPaintTexture5, uv).rg;
  if (index == 6) return texture2D(uLayerPaintTexture6, uv).rg;
  if (index == 7) return texture2D(uLayerPaintTexture7, uv).rg;
  if (index == 8) return texture2D(uLayerPaintTexture8, uv).rg;
  if (index == 9) return texture2D(uLayerPaintTexture9, uv).rg;
  if (index == 10) return texture2D(uLayerPaintTexture10, uv).rg;
  if (index == 11) return texture2D(uLayerPaintTexture11, uv).rg;
  if (index == 12) return texture2D(uLayerPaintTexture12, uv).rg;
  if (index == 13) return texture2D(uLayerPaintTexture13, uv).rg;
  if (index == 14) return texture2D(uLayerPaintTexture14, uv).rg;
  return texture2D(uLayerPaintTexture15, uv).rg;
}

const int MAX_OCTAVES = 12; // loop upper bound — actual count is octaves, via the break below
// Patch bakes may continue a layer's octave series past its Octaves setting,
// as far as the sample spacing can still show each one (see fbm3D). This caps
// that, and the cost, for the deepest patches.
const int MAX_DEEP_OCTAVES = 24;

// The base generator, selected once per layer — random/perlin/simplex/
// voronoi only; 'none' is handled separately (see isNoneType in main()
// below). Modifiers (fbm/domain warp/ridge/terrace) all dispatch through
// this instead of hardcoding perlinNoise3D, so any of them can layer onto
// any base generator (Dana, 2026-09-30) — previously fbm3D/domainWarp3D
// each called perlinNoise3D directly, secretly limiting Octaves/Domain warp
// to Perlin only. See ISSUES.md.
float evalBaseGenerator(vec3 p, float seed, float baseType) {
  if (baseType < 0.5) return randomNoise3D(p, seed);
  else if (baseType < 1.5) return perlinNoise3D(p, seed);
  else if (baseType < 2.5) return simplexNoise3D(p, seed);
  else return voronoiNoise3D(p, seed);
}

// Octave fade by sample spacing (Lagae and Drettakis, "Filtering Solid Gabor
// Noise", supplementary: Nyquist is 1/(2*spacing) and the weight is
// smoothstep(fmin, fmax, nyquist); Quilez, "bandlimiting", for the idea).
// 0.25 and 0.95 are the paper's Perlin values, found experimentally for
// pixel shading, so treat them as tunable here. Mapping the paper's pixel
// spacing onto a baked vertex grid is this project's own inference.
const float NYQUIST_FADE_MIN = 0.25;
const float NYQUIST_FADE_MAX = 0.95;

// Extras set per layer in main(): the spacing between baked samples measured
// in the layer's own lattice cells (0 = no fade), and the ridged controls.
float gLatticeSpacing = 0.0;
float gRidgeOffset = 1.0;
float gRidgeGain = 1.0;
float gFractalType = 0.0;
float gFractalOffset = 0.0;
float gFractalGain = 1.0;

// 1 while an octave's lattice is well resolved by the sample grid, 0 once its
// features are smaller than the grid can show.
float octaveFade(float latticeSpacing) {
  if (latticeSpacing <= 0.0) return 1.0;
  return smoothstep(NYQUIST_FADE_MIN, NYQUIST_FADE_MAX, 0.5 / latticeSpacing);
}

// The amplitude total of the whole series, independent of how many octaves
// are faded, so coarse octaves carry the same weight at every patch depth
// (the noise is a pure function of position, as in Cesium's write-up).
float fullSeriesAmplitude(float octaves, float persistence) {
  float total = 0.0;
  float amplitude = 1.0;
  for (int i = 0; i < MAX_OCTAVES; i++) {
    if (i >= int(octaves)) break;
    total += amplitude;
    amplitude *= persistence;
  }
  return max(total, 0.0001);
}

// The extra fine octaves of a Voronoi layer ("detail by level", past the layer's own octaves), guarded so cells don't
// stack into a regular egg-crate up close (Dana, 2026-10-27). Each gets its own seed, as FastNoiseLite advances the seed
// every octave (seed++), and its own small warp (FastNoiseLite's independent per-octave warp), so the levels' lattices
// never line up; and it is blended in lightly, as xarray-spatial blends Worley noise for micro-texture (0.1 to 0.3).
// Warp amount inferred, TUNABLE.
const float VORONOI_DETAIL_BLEND = 0.2;
const float VORONOI_DETAIL_WARP = 0.35; // in lattice cells
// Every octave's lattice is lined up with the same axes, so octaves that scale by exactly 2 nest and their alignment adds
// up into regular rows. Extra fine octaves are rotated before scaling, with Quilez's orthonormal fbm matrix and a step
// just off 2 (p = m*p*2.02, as in his fbm shaders), so no two share axes. The layer's own octaves are untouched.
const mat3 OCTAVE_ROTATION = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
const float DEEP_LACUNARITY_NUDGE = 1.01; // 2 becomes 2.02
vec3 nextOctavePoint(vec3 point, int i, float octaves, float lacunarity) {
  return i + 1 >= int(octaves) ? OCTAVE_ROTATION * point * (lacunarity * DEEP_LACUNARITY_NUDGE) : point * lacunarity;
}

// Extra fine octaves of any type get their own seed (FastNoiseLite's seed++), so their lattices don't line up with the
// coarser ones into regular ripples; the layer's own octaves keep its seed, so the large shapes don't change.
float octaveSeed(float seed, int i, float octaves) {
  return i >= int(octaves) ? seed + float(i) : seed;
}
bool isDeepCellOctave(int i, float octaves, float baseType) {
  return i >= int(octaves) && baseType > 2.5;
}
float deepCellOctave(vec3 point, float seed, int i, float baseType) {
  float octaveSeed = seed + float(i);
  vec3 warp = vec3(
    perlinNoise3D(point + vec3(5.2, 1.3, 2.8), octaveSeed),
    perlinNoise3D(point + vec3(1.7, 9.2, 4.1), octaveSeed),
    perlinNoise3D(point + vec3(8.3, 2.8, 6.5), octaveSeed));
  return VORONOI_DETAIL_BLEND * evalBaseGenerator(point + warp * VORONOI_DETAIL_WARP, octaveSeed, baseType);
}

// fBm (fractal Brownian motion): sums several octaves of the base generator
// at increasing frequency (lacunarity) and decreasing amplitude
// (persistence). Standard formula — verified against
// thebookofshaders.com/13, 2026-09-14 — generalized 2026-09-30 to any base
// generator via evalBaseGenerator, not hardcoded to Perlin. Each octave is
// faded out once the sample grid can no longer show it (octaveFade above).
// A patch bake (latticeSpacing > 0) with allowDeep set keeps adding octaves
// past `octaves` while the grid can still show them, the same persistence
// and lacunarity series, so the coarse shape is the same at every depth and
// deeper patches only gain finer detail ("the closer the camera, the greater
// the number of octaves", Cesium's procedural terrain write-up). It needs
// persistence < 1 (or the extra octaves would outgrow the ones before them)
// and lacunarity > 1 (or they would repeat the same frequency).
// The sum stays divided by the configured series' total, not the extended
// one, so existing layers keep their look.
float fbm3D(vec3 p, float seed, float baseType, float octaves, float persistence, float lacunarity, float latticeSpacing, bool allowDeep) {
  float value = 0.0;
  float amplitude = 1.0;
  float spacing = latticeSpacing;
  vec3 samplePoint = p;
  bool deepOn = allowDeep && latticeSpacing > 0.0 && persistence < 1.0 && lacunarity > 1.0;
  for (int i = 0; i < MAX_DEEP_OCTAVES; i++) {
    if (i >= int(octaves) && !deepOn) break;
    float fade = octaveFade(spacing);
    if (fade <= 0.0) break; // every finer octave is faded out too
    float octaveNoise = isDeepCellOctave(i, octaves, baseType) ? deepCellOctave(samplePoint, seed, i, baseType) : evalBaseGenerator(samplePoint, octaveSeed(seed, i, octaves), baseType);
    value += amplitude * fade * octaveNoise;
    samplePoint = nextOctavePoint(samplePoint, i, octaves, lacunarity);
    amplitude *= persistence;
    spacing *= lacunarity;
  }
  return value / fullSeriesAmplitude(octaves, persistence); // roughly -1..1
}

// Ridged-multifractal fBm (Musgrave's method, adapted to this project's own
// ridge()): folds *each octave's own sample* before summing it, with the
// next octave's contribution weighted by how strongly the previous one
// folded (the feedback term) — not fbm3D's plain sum folded once at the end.
// Folding one already-summed signal turns every zero-crossing of that
// combined signal into an isolated spike (dense and isotropic at high
// frequency); folding per octave is what keeps ridges continuous and
// hierarchical across scales instead. See REFERENCES.md and [B31] in
// ISSUES.md. Offset and Gain follow Blender's Ridged Multifractal (offset
// inside the fold, gain scaling the feedback weight); at 1 and 1 this is the
// fold used before they existed. ridge()'s own output is symmetric about 0
// (this file's own convention, see noise.glsl), so the feedback weight uses
// abs() to read magnitude regardless of sign, clamped to [0,1] so it can only
// ever damp the next octave, never amplify it unboundedly.
// The octave is faded before the fold (the only hint found, a forum thread,
// says to fade inside a non-linear function); a faded octave then reads as
// ridge(0), a constant, which keeps the sum continuous across depths. That
// choice is unsourced and shifts a ridged layer's mean slightly with depth.
float ridgedFbm3D(vec3 p, float seed, float baseType, float octaves, float persistence, float lacunarity, float ridgeAmount, float latticeSpacing) {
  float value = 0.0;
  float amplitude = 1.0;
  float weight = 1.0;
  float spacing = latticeSpacing;
  vec3 samplePoint = p;
  bool deepOn = latticeSpacing > 0.0 && persistence < 1.0 && lacunarity > 1.0; // extra octaves for deep patches, see fbm3D
  for (int i = 0; i < MAX_DEEP_OCTAVES; i++) {
    if (i >= int(octaves) && !deepOn) break;
    float fade = octaveFade(spacing);
    if (i >= int(octaves) && fade <= 0.0) break; // no finer octave can show either
    float octaveNoise = fade <= 0.0 ? 0.0 : isDeepCellOctave(i, octaves, baseType) ? deepCellOctave(samplePoint, seed, i, baseType) : evalBaseGenerator(samplePoint, octaveSeed(seed, i, octaves), baseType);
    float raw = fade * octaveNoise; // skips the noise call once faded out
    float folded = mix(raw, ridge(raw, gRidgeOffset), ridgeAmount) * weight;
    value += amplitude * folded;
    weight = clamp(abs(folded) * gRidgeGain, 0.0, 1.0);
    samplePoint = nextOctavePoint(samplePoint, i, octaves, lacunarity);
    amplitude *= persistence;
    spacing *= lacunarity;
  }
  return value / fullSeriesAmplitude(octaves, persistence); // roughly -1..1, same convention as fbm3D
}

// Musgrave's other fractal types (multifractal, hybrid multifractal, hetero
// terrain, ridged multifractal), as Blender's open-source Musgrave shader
// implements them (blender v3.6.0, gpu_shader_material_tex_musgrave.glsl;
// the recurrences below follow a read of that file whose fetch omitted some
// loop bodies). They set how a layer's octaves combine, so valleys and peaks
// can differ in roughness, which plain fBm cannot. n is the signed base noise
// (-1..1), pwr the octave's amplitude (persistence^i, which is Blender's
// pow(lacunarity, -H)).
// Inferred here, not documented anywhere: n is faded by octaveFade before it
// enters each recurrence AND hybrid/hetero/ridged contributions are scaled by
// the fade, so a fully faded octave adds nothing; and each result is recentred
// and rescaled into about -1..1 by fixed estimates (these types are unbounded
// and can go negative), then clamped. All tunable; bounded heights later
// replaces the clamp.
float fractalNoise3D(vec3 p, float seed, float baseType, float fractalType, float octaves, float persistence, float lacunarity, float latticeSpacing) {
  float offset = gFractalOffset;
  float gain = gFractalGain;
  float value = fractalType < 1.5 ? 1.0 : 0.0; // multifractal is a running product
  float pwr = 1.0;
  float weight = 1.0;
  float signal = 0.0;
  float spacing = latticeSpacing;
  vec3 samplePoint = p;
  bool deepOn = latticeSpacing > 0.0 && persistence < 1.0 && lacunarity > 1.0; // extra octaves for deep patches, see fbm3D
  for (int i = 0; i < MAX_DEEP_OCTAVES; i++) {
    if (i >= int(octaves) && !deepOn) break;
    float fade = octaveFade(spacing);
    if (fade <= 0.0) break; // every finer octave is faded out too
    float n = fade * (isDeepCellOctave(i, octaves, baseType) ? deepCellOctave(samplePoint, seed, i, baseType) : evalBaseGenerator(samplePoint, octaveSeed(seed, i, octaves), baseType));
    if (fractalType < 1.5) {
      value *= pwr * n + 1.0; // multifractal
    } else if (fractalType < 2.5) {
      signal = (n + offset) * pwr * fade; // hybrid multifractal
      value += weight * signal;
      weight = clamp(weight * gain * signal, 0.0, 1.0);
      if (weight <= 0.001) break; // Blender stops here: valleys stay smooth
    } else if (fractalType < 3.5) {
      if (i == 0) value = offset + n; // hetero terrain: each octave scales with the height so far
      else value += (n + offset) * pwr * value * fade;
    } else {
      if (i > 0) weight = clamp(signal * gain, 0.0, 1.0); // ridged multifractal
      signal = offset - abs(n);
      signal *= signal;
      if (i > 0) signal *= weight;
      value += signal * pwr * fade;
    }
    samplePoint = nextOctavePoint(samplePoint, i, octaves, lacunarity);
    pwr *= persistence;
    spacing *= lacunarity;
  }
  float total = fullSeriesAmplitude(octaves, persistence);
  float result;
  if (fractalType < 1.5) {
    result = (value - 1.0) / total; // the product centers on 1
  } else if (fractalType < 3.5) {
    result = (value - offset) / total; // hybrid and hetero start about offset high
  } else {
    // The first octave's mean and half range for a noise value in -1..1.
    float mean = (offset * offset * offset - (offset - 1.0) * (offset - 1.0) * (offset - 1.0)) / 3.0;
    float halfRange = max(max(mean, max(offset * offset, (offset - 1.0) * (offset - 1.0)) - mean), 0.0001);
    result = (value / total - mean) / halfRange;
  }
  return clamp(result, -1.0, 1.0);
}

// Domain warp: f(p + h(p)) — displaces the sample coordinate by a noise-
// built offset vector before whatever comes next in the pipeline (the base
// generator, or fbm sampling at that displaced position), for a more
// organic, less grid-aligned look. Standard technique, verified against
// iquilezles.org/articles/warp, 2026-09-14. The offset's three components
// are decorrelated by sampling the base generator at three different fixed
// offsets from p, since there's no vector-valued noise function here.
// Generalized 2026-09-30 to any base generator, same reasoning as fbm3D.
// Warp scale multiplies the frequency the warp noise is read at, and Warp
// octaves layers it as fBm (Unity's warp Offset/Iterations, World Creator's
// and Gaea's warp Frequency/Octaves); 1 and 1 give the single sample used
// before they existed. The octave persistence (0.5) and lacunarity (2) are
// the standard fBm defaults, not values from those tools.
vec3 domainWarpOffset(vec3 p, float seed, float baseType, float warpScale, float warpOctaves) {
  float spacing = gLatticeSpacing * warpScale;
  vec3 q = p * warpScale;
  float x = fbm3D(q + vec3(5.2, 1.3, 2.8), seed, baseType, warpOctaves, 0.5, 2.0, spacing, false);
  float y = fbm3D(q + vec3(1.7, 9.2, 4.1), seed, baseType, warpOctaves, 0.5, 2.0, spacing, false);
  float z = fbm3D(q + vec3(8.3, 2.8, 6.5), seed, baseType, warpOctaves, 0.5, 2.0, spacing, false);
  return vec3(x, y, z);
}

// Returns the warped *position*, not a noise value directly — unlike the
// old domainWarp3D, since whatever comes after in the pipeline (fbm or the
// plain base generator) needs to sample AT this displaced position, not
// receive a pre-computed scalar. poleFalloff tapers the warp to 0 at the
// poles (where vertices are packed closest together) so it doesn't pinch
// the geometry — see ISSUES.md, 2026-09-15.
vec3 domainWarpedPosition(vec3 p, float seed, float baseType, float poleFalloff, float warpStrength, float warpScale, float warpOctaves) {
  return p + warpStrength * poleFalloff * domainWarpOffset(p, seed, baseType, warpScale, warpOctaves);
}

// Converts an equirectangular UV coordinate to its position on the unit
// sphere. Sampling noise at this 3D point (rather than at the flat UV
// directly) is what avoids pole-pinching and seam artifacts once this
// texture displaces a sphere — see noise.glsl's perlinNoise3D comment.
// Region bake (see map/heightmap.ts's renderRegion). Off by default, in
// which case this pass covers the whole globe exactly as it always has.
// A region is one cube face plus a rectangle on it, the same way a
// subdividing patch is described, so this generalizes without rework.
// See ISSUES.md, "Planet mesh and adaptive resolution".
uniform float uRegionMode; // 0 = whole globe, 1 = the region below
uniform float uRegionFace; // 0..5, matching CUBE_FACES in planet/mesh.ts
uniform vec2 uRegionMin;   // face-local coordinates, each in [-1, 1]
uniform vec2 uRegionMax;
uniform float uRegionSamples; // the bake target's own resolution, see below

// Mirrors cubeFacePoint() in planet/mesh.ts. Kept deliberately identical:
// the region a patch bakes has to be the same surface the mesh builds, or
// the terrain would not line up with the geometry showing it.
vec3 cubeFacePoint(float face, float u, float v) {
  if (face < 0.5) return vec3(1.0, v, -u);   // +X
  if (face < 1.5) return vec3(-1.0, v, u);   // -X
  if (face < 2.5) return vec3(u, 1.0, -v);   // +Y
  if (face < 3.5) return vec3(u, -1.0, v);   // -Y
  if (face < 4.5) return vec3(u, v, 1.0);    // +Z
  return vec3(-u, v, -1.0);                  // -Z
}

// Where on the equirectangular paint textures a given sphere position sits.
// Paint stays in the rectangular map, so a region still reads it through
// this; fine away from the poles, where every longitude converges to one
// point. See ISSUES.md.
vec2 spherePositionToPaintUv(vec3 spherePosition) {
  float longitude = atan(spherePosition.z, spherePosition.x);
  float latitude = asin(clamp(spherePosition.y, -1.0, 1.0));
  vec2 uv = vec2(longitude / (2.0 * 3.14159265) + 0.5, latitude / 3.14159265 + 0.5);
  if (uv.y < 0.0001 || uv.y > 0.9999) uv.x = 0.5;
  return uv;
}

vec3 uvToSpherePosition(vec2 uv) {
  // Snap poles to an exact (0, ±1, 0) — floating-point PI/2 leaves a tiny
  // per-vertex residual otherwise, amplified into a visible pinch by domain
  // warp's nested noise calls. See ISSUES.md, 2026-09-15.
  if (uv.y < 0.0001) return vec3(0.0, -1.0, 0.0);
  if (uv.y > 0.9999) return vec3(0.0, 1.0, 0.0);
  float longitude = (uv.x - 0.5) * 2.0 * 3.14159265;
  float latitude = (uv.y - 0.5) * 3.14159265;
  float cosLatitude = cos(latitude);
  return vec3(cosLatitude * cos(longitude), sin(latitude), cosLatitude * sin(longitude));
}

// Evaluates one layer's raw noise: base generator (noiseType) plus whatever
// modifiers are toggled on, composed in Gaea's fixed order — Domain warp
// (displaces the sample position) → generator/Octaves (fbm if octavesOn,
// else a single sample) → Ridged (blended by ridgeAmount) → Terrace.
// Rewritten 2026-09-30 from a flat noiseType switch (where Ridged/Octaves/
// Terrace/Domain warp were separate, mutually-exclusive, Perlin-only
// types) into this composable pipeline — see ISSUES.md.
float evalLayerNoise(
  vec3 p, float seed, float noiseType,
  bool domainWarpOn, bool octavesOn, bool ridgedOn, bool terraceOn,
  float octaves, float persistence, float lacunarity,
  float terraceSteps, float warpStrength, float ridgeAmount, float poleFalloff,
  float warpScale, float warpOctaves
) {
  vec3 samplePoint = domainWarpOn ? domainWarpedPosition(p, seed, noiseType, poleFalloff, warpStrength, warpScale, warpOctaves) : p;

  // Ridging several octaves needs its own accumulation (ridgedFbm3D folds
  // each octave before summing, see its own comment above) — folding a
  // single sample has nothing "per-octave" to fix, that path is unchanged.
  // A fractal type other than fBm replaces the octave sum; the Ridged modifier,
  // if on, then folds its result once like any other single sample.
  float value;
  if (octavesOn && gFractalType > 0.5) {
    value = fractalNoise3D(samplePoint, seed, noiseType, gFractalType, octaves, persistence, lacunarity, gLatticeSpacing);
    if (ridgedOn) value = mix(value, ridge(value, gRidgeOffset), ridgeAmount);
  } else if (octavesOn && ridgedOn) {
    value = ridgedFbm3D(samplePoint, seed, noiseType, octaves, persistence, lacunarity, ridgeAmount, gLatticeSpacing);
  } else {
    value = octavesOn
      ? fbm3D(samplePoint, seed, noiseType, octaves, persistence, lacunarity, gLatticeSpacing, true)
      : evalBaseGenerator(samplePoint, seed, noiseType);
    if (ridgedOn) value = mix(value, ridge(value, gRidgeOffset), ridgeAmount);
  }
  if (terraceOn) value = terrace(value, terraceSteps);

  return value;
}

// Combines a layer's height with the running composite, per Gaea's Combine
// node conventions (verified against docs.quadspinner.com, 2026-09-15) —
// opacity is then applied as a final crossfade against this raw result,
// matching Photoshop's own opacity-plus-blend-mode formula.
float applyBlendMode(float composite, float layerHeight, float blendMode) {
  if (blendMode < 0.5) {
    return layerHeight; // normal
  } else if (blendMode < 1.5) {
    return composite + layerHeight; // add
  } else if (blendMode < 2.5) {
    return composite - layerHeight; // subtract
  } else if (blendMode < 3.5) {
    return composite * layerHeight; // multiply
  } else if (blendMode < 4.5) {
    return max(composite, layerHeight); // max
  } else if (blendMode < 5.5) {
    return min(composite, layerHeight); // min
  } else {
    return 1.0 - (1.0 - composite) * (1.0 - layerHeight); // screen
  }
}

// Planet-wide fine detail, the fractal refinement planet engines add under the
// designed terrain as patches split (Proland's per-level noise, Outerra's
// fractal refinement): fBm with persistence 0.5 and lacunarity 2, each octave
// fading in only once the bake grid can show it, so it appears as you zoom.
// The starting frequency and the amount are inferred, TUNABLE ([B51]).
const float DETAIL_BASE_FREQUENCY = 64.0;
const float DETAIL_SEED = 17.0;
float planetDetail(vec3 position, float sampleSpacing) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = DETAIL_BASE_FREQUENCY;
  for (int i = 0; i < MAX_DEEP_OCTAVES; i++) {
    float fade = octaveFade(sampleSpacing * frequency);
    if (fade <= 0.0) break; // every finer octave is faded out too
    value += amplitude * fade * evalBaseGenerator(position * frequency, DETAIL_SEED + float(i), 1.0); // own seed per octave (FastNoiseLite's seed++)
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return value;
}

void main() {
  // Only these two lines differ between a whole-globe bake and a region
  // bake: which surface point this pixel stands for, and where to read
  // paint for it. Everything below is identical either way.
  vec3 basePosition;
  vec2 paintUV;
  // Distance between neighboring samples on the unit sphere, 0 when the
  // whole globe is baked (no octave fade there).
  float sampleSpacing = 0.0;
  if (uRegionMode > 0.5) {
    // vUv is sampled at each texel's own center ("pixel is area"), so a raw
    // mix() put the edge texel's data slightly inside the region, not on
    // its true boundary — two neighboring patches then each measure a
    // slightly different physical point for what's meant to be one shared
    // edge. Remapped to "pixel is point" (the standard GeoTIFF/DEM tiling
    // fix for this exact mismatch, see REFERENCES.md) so texel 0 lands
    // exactly on uRegionMin and the last texel exactly on uRegionMax.
    vec2 edgeAlignedUV = (vUv * uRegionSamples - 0.5) / (uRegionSamples - 1.0);
    vec2 faceCoord = mix(uRegionMin, uRegionMax, edgeAlignedUV);
    vec3 cubePoint = cubeFacePoint(uRegionFace, faceCoord.x, faceCoord.y);
    basePosition = normalize(cubePoint);
    // A step across the cube face is shorter on the sphere by about 1/|cubePoint|.
    sampleSpacing = uSampleSpacing / length(cubePoint);
    paintUV = spherePositionToPaintUv(basePosition);
  } else {
    basePosition = uvToSpherePosition(vUv);
    // Pole rows converge to one 3D point but keep varying U — force U to a
    // fixed value there so every pole vertex samples the same paint texel,
    // same reasoning as uvToSpherePosition's pole snap. See ISSUES.md, 2026-09-16.
    paintUV = vUv;
    if (vUv.y < 0.0001 || vUv.y > 0.9999) paintUV.x = 0.5;
  }
  // 1 at the equator, 0 at the poles. From the position rather than from
  // the pass coordinate, so it is correct for a region bake too.
  float poleFalloff = length(basePosition.xz);

  // Layers composite bottom-to-top (index 0 = bottom/base, last = top),
  // matching Photoshop's stacking convention — see ISSUES.md, 2026-09-15.
  // Starts at 0.5 (gray/neutral, "no displacement") not 0.0 (black) — matches
  // the same convention used elsewhere (planet.ts's flat placeholder texture,
  // vertex.glsl's height-centering); 0.0 made painted black indistinguishable
  // from an empty/no-fill layer. See ISSUES.md, 2026-09-22.
  float composite = 0.5;
  // Terrain's zero — not 0.5 like the shape composite above, a real "no
  // displacement" baseline (Dana, 2026-09-24). See the elevation line below.
  float elevation = 0.0;
  // Hidden layers (Dana, 2026-09-23) are filtered out entirely before this
  // material's uniforms are ever set (see map/heightmap.ts's render()) —
  // uLayerCount only counts visible ones, so a hidden layer's noise is
  // never evaluated here at all, not just zero-weighted.
  // Pass 1: every packed layer's own height, coverage and mask value. Indexed
  // only by the loop counter, never by a uniform (GLSL ES 1.00 limit on
  // dynamic indexing).
  float layerHeights[MAX_LAYERS];
  float layerCoverages[MAX_LAYERS];
  float layerMaskValues[MAX_LAYERS];
  for (int i = 0; i < MAX_LAYERS; i++) {
    layerHeights[i] = 0.0;
    layerCoverages[i] = 0.0;
    layerMaskValues[i] = 0.0;
    if (i >= int(uLayerCount)) break;
    // noiseType 4 = none — matches map/heightmap.ts's NOISE_TYPE_INDEX.
    bool isNoneType = uLayerNoiseType[i] > 3.5;
    vec3 stretch = uLayerStretch[i];
    vec3 p = basePosition * uLayerFrequency[i] * stretch + uLayerOffset[i];
    // The sample spacing in this layer's lattice cells, using its widest
    // axis so a stretched layer is faded conservatively.
    gLatticeSpacing = sampleSpacing * uLayerFrequency[i] * max(stretch.x, max(stretch.y, stretch.z));
    gVoronoiJitter = uLayerVoronoiJitter[i];
    gVoronoiDistance = uLayerVoronoiDistance[i];
    gRidgeOffset = uLayerRidgeOffset[i];
    gRidgeGain = uLayerRidgeGain[i];
    gFractalType = uLayerFractalType[i];
    gFractalOffset = uLayerFractalOffset[i];
    gFractalGain = uLayerFractalGain[i];
    // 'none' has no generator content of its own — skip evaluating it
    // entirely (raw is unused below for isNoneType anyway), same reasoning
    // as hidden layers being filtered out before this loop runs at all.
    float raw = isNoneType ? 0.0 : evalLayerNoise(
      p, uLayerSeed[i], uLayerNoiseType[i],
      uLayerDomainWarpOn[i] > 0.5, uLayerOctavesOn[i] > 0.5, uLayerRidgedOn[i] > 0.5, uLayerTerraceOn[i] > 0.5,
      uLayerOctaves[i], uLayerPersistence[i], uLayerLacunarity[i],
      uLayerTerraceSteps[i], uLayerWarpStrength[i], uLayerRidgeAmount[i], poleFalloff,
      uLayerWarpScale[i], uLayerWarpOctaves[i]
    );
    vec2 paint = samplePaintTexture(i, paintUV); // (value, mask)
    // A 'none' layer has no content of its own — true "no fill" — so its
    // height is purely the painted value, with no placeholder gray blended
    // in at all; paint.y (the mask) is applied exactly once, as coverage
    // below, not also folded into layerHeight (that double application
    // caused a compounded/ridged edge at soft stroke boundaries). A noise
    // layer keeps the old per-pixel paint-overrides-noise blend and always
    // has full coverage. See ISSUES.md, 2026-09-22.
    layerHeights[i] = isNoneType ? paint.x : mix(raw * 0.5 + 0.5, paint.x, paint.y);
    layerCoverages[i] = isNoneType ? paint.y : 1.0;
    // The layer's own mask pattern: a plain base generator with default
    // Voronoi settings, 0..1, the same pattern map/heightmap.ts measures.
    if (uLayerMaskType[i] > -0.5) {
      gVoronoiJitter = 1.0;
      gVoronoiDistance = 0.0;
      layerMaskValues[i] = evalBaseGenerator(basePosition * uLayerMaskFrequency[i], uLayerMaskSeed[i], uLayerMaskType[i]) * 0.5 + 0.5;
    }
  }

  // Pass 2: composite bottom-to-top, each layer's coverage scaled by its
  // mask (Gaea's convention: the layer's effect, blended in by the mask).
  for (int i = 0; i < MAX_LAYERS; i++) {
    if (i >= int(uLayerCount)) break;
    float layerHeight = layerHeights[i];
    float coverage = layerCoverages[i];

    if (uLayerMaskType[i] > -0.5) {
      float maskAmount = smoothstep(uLayerMaskMin[i], max(uLayerMaskMin[i] + 0.0001, uLayerMaskMax[i]), layerMaskValues[i]);
      coverage *= uLayerMaskInvert[i] > 0.5 ? 1.0 - maskAmount : maskAmount;
    }

    float blended = applyBlendMode(composite, layerHeight, uLayerBlendMode[i]);
    composite = mix(composite, blended, uLayerOpacity[i] * coverage);

    // Elevation (Height) is a genuinely separate quantity from the shape
    // composite above — not related to Opacity or Blend Mode at all (Dana,
    // 2026-09-24: "same as an amplitude/strength control... it's a separate
    // param"), same as a height/strength layer in Blender/World
    // Machine/Gaea. Reuses this layer's own layerHeight (noise AND paint,
    // whatever's actually present at this pixel — "sample from everything
    // in a specific layer") re-centered on 0 (terrain's zero, not the shape
    // channel's 0.5 neutral gray) and scaled by this layer's own Height,
    // then summed additively across every layer — no blend mode, no
    // opacity. `coverage` (not opacity) still applies so an unpainted area
    // of a paint-only layer contributes exactly 0, not a phantom dip.
    elevation += uLayerHeightScale[i] * (layerHeight - 0.5) * coverage;
  }

  // R = shape (clamped 0..1, unchanged — drives the 2D canvas/painting).
  // G = elevation (unclamped, can exceed 1 or go negative — real height,
  // read by the planet's displacement and the land chunk instead of R).
  // See map/heightmap.ts, ISSUES.md, 2026-09-24.
  if (sampleSpacing > 0.0 && uDetailAmount > 0.0) {
    // None below sea level, then linear over twice the detail's largest swing (its octaves sum below 2), so a dip
    // never reaches the sea and the coastline never moves (Dana: no rough patches where there's water).
    float shoreFade = uShoreEnabled > 0.5 ? clamp((elevation - uShoreSeaLevel) / (2.0 * uDetailAmount), 0.0, 1.0) : 1.0;
    elevation += uDetailAmount * shoreFade * planetDetail(basePosition, sampleSpacing);
  }
  gl_FragColor = vec4(clamp(composite, 0.0, 1.0), elevation, 0.0, 1.0);
}
