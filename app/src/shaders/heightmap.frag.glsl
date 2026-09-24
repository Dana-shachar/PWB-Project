// Depends on noise.glsl's noise functions — concatenated together at usage
// time in map/heightmap.ts (no #include mechanism, per the ?raw-import +
// string-concatenation approach agreed on 2026-09-02).

varying vec2 vUv;

const int MAX_LAYERS = 16; // loop upper bound — actual count is uLayerCount, via the break below

uniform float uLayerCount;
uniform float uLayerNoiseType[MAX_LAYERS]; // 0=random, 1=perlin, 2=simplex, 3=voronoi, 4=ridged, 5=none, 6=octaves, 7=terrace, 8=domain warp
uniform float uLayerSeed[MAX_LAYERS];
uniform float uLayerFrequency[MAX_LAYERS];
uniform float uLayerOctaves[MAX_LAYERS];
uniform float uLayerPersistence[MAX_LAYERS];
uniform float uLayerLacunarity[MAX_LAYERS];
uniform float uLayerTerraceSteps[MAX_LAYERS];
uniform float uLayerWarpStrength[MAX_LAYERS];
uniform float uLayerOpacity[MAX_LAYERS];
uniform float uLayerBlendMode[MAX_LAYERS]; // 0=normal, 1=add, 2=subtract, 3=multiply, 4=max, 5=min, 6=screen
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

const int MAX_OCTAVES = 8; // loop upper bound — actual count is octaves, via the break below

// fBm (fractal Brownian motion): sums several octaves of Perlin noise at
// increasing frequency (lacunarity) and decreasing amplitude (persistence).
// Standard formula — verified against thebookofshaders.com/13, 2026-09-14.
float fbm3D(vec3 p, float seed, float octaves, float persistence, float lacunarity) {
  float value = 0.0;
  float amplitude = 1.0;
  float maxAmplitude = 0.0;
  vec3 samplePoint = p;
  for (int i = 0; i < MAX_OCTAVES; i++) {
    if (i >= int(octaves)) break;
    value += amplitude * perlinNoise3D(samplePoint, seed);
    maxAmplitude += amplitude;
    samplePoint *= lacunarity;
    amplitude *= persistence;
  }
  return value / maxAmplitude; // normalize back to roughly -1..1
}

// Domain warp: f(p + h(p)) — displaces the sample coordinate by a noise-
// built offset vector before the final noise evaluation, for a more organic,
// less grid-aligned look. Standard technique, verified against
// iquilezles.org/articles/warp, 2026-09-14. The offset's three components
// are decorrelated by sampling perlinNoise3D at three different fixed
// offsets from p, since there's no vector-valued noise function here.
vec3 domainWarpOffset(vec3 p, float seed) {
  float x = perlinNoise3D(p + vec3(5.2, 1.3, 2.8), seed);
  float y = perlinNoise3D(p + vec3(1.7, 9.2, 4.1), seed);
  float z = perlinNoise3D(p + vec3(8.3, 2.8, 6.5), seed);
  return vec3(x, y, z);
}

// poleFalloff tapers the warp to 0 at the poles (where vertices are packed
// closest together) so it doesn't pinch the geometry — see ISSUES.md, 2026-09-15.
float domainWarp3D(vec3 p, float seed, float poleFalloff, float warpStrength) {
  vec3 warped = p + warpStrength * poleFalloff * domainWarpOffset(p, seed);
  return perlinNoise3D(warped, seed);
}

// Converts an equirectangular UV coordinate to its position on the unit
// sphere. Sampling noise at this 3D point (rather than at the flat UV
// directly) is what avoids pole-pinching and seam artifacts once this
// texture displaces a sphere — see noise.glsl's perlinNoise3D comment.
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

// Evaluates one layer's raw noise type — same generators/modifiers as
// before, just taking a layer's own params instead of reading global uniforms.
float evalLayerNoise(
  vec3 p, float seed, float noiseType,
  float octaves, float persistence, float lacunarity,
  float terraceSteps, float warpStrength, float poleFalloff
) {
  if (noiseType < 0.5) {
    return randomNoise3D(p, seed);
  } else if (noiseType < 1.5) {
    return perlinNoise3D(p, seed);
  } else if (noiseType < 2.5) {
    return simplexNoise3D(p, seed);
  } else if (noiseType < 3.5) {
    return voronoiNoise3D(p, seed);
  } else if (noiseType < 4.5) {
    return ridge(perlinNoise3D(p, seed)); // ridged is a modifier on Perlin, not its own generator
  } else if (noiseType < 5.5) {
    return 0.0; // none — flat, no contribution
  } else if (noiseType < 6.5) {
    return fbm3D(p, seed, octaves, persistence, lacunarity); // octaves is a modifier on Perlin, not its own generator
  } else if (noiseType < 7.5) {
    return terrace(perlinNoise3D(p, seed), terraceSteps); // terrace is a modifier on Perlin, not its own generator
  } else {
    return domainWarp3D(p, seed, poleFalloff, warpStrength); // domain warp is a modifier on Perlin, not its own generator
  }
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

void main() {
  vec3 basePosition = uvToSpherePosition(vUv);
  float latitude = (vUv.y - 0.5) * 3.14159265;
  float poleFalloff = cos(latitude); // 1 at equator, 0 at poles

  // Pole rows converge to one 3D point but keep varying U — force U to a
  // fixed value there so every pole vertex samples the same paint texel,
  // same reasoning as uvToSpherePosition's pole snap. See ISSUES.md, 2026-09-16.
  vec2 paintUV = vUv;
  if (vUv.y < 0.0001 || vUv.y > 0.9999) paintUV.x = 0.5;

  // Layers composite bottom-to-top (index 0 = bottom/base, last = top),
  // matching Photoshop's stacking convention — see ISSUES.md, 2026-09-15.
  // Starts at 0.5 (gray/neutral, "no displacement") not 0.0 (black) — matches
  // the same convention used elsewhere (planet.ts's flat placeholder texture,
  // vertex.glsl's height-centering); 0.0 made painted black indistinguishable
  // from an empty/no-fill layer. See ISSUES.md, 2026-09-22.
  float composite = 0.5;
  // Hidden layers (Dana, 2026-09-23) are filtered out entirely before this
  // material's uniforms are ever set (see map/heightmap.ts's render()) —
  // uLayerCount only counts visible ones, so a hidden layer's noise is
  // never evaluated here at all, not just zero-weighted.
  for (int i = 0; i < MAX_LAYERS; i++) {
    if (i >= int(uLayerCount)) break;
    vec3 p = basePosition * uLayerFrequency[i];
    float raw = evalLayerNoise(
      p, uLayerSeed[i], uLayerNoiseType[i],
      uLayerOctaves[i], uLayerPersistence[i], uLayerLacunarity[i],
      uLayerTerraceSteps[i], uLayerWarpStrength[i], poleFalloff
    );
    vec2 paint = samplePaintTexture(i, paintUV); // (value, mask)
    // A 'none' layer has no content of its own — true "no fill" — so its
    // height is purely the painted value, with no placeholder gray blended
    // in at all; paint.y (the mask) is applied exactly once, as coverage
    // below, not also folded into layerHeight (that double application
    // caused a compounded/ridged edge at soft stroke boundaries). A noise
    // layer keeps the old per-pixel paint-overrides-noise blend and always
    // has full coverage. See ISSUES.md, 2026-09-22.
    bool isNoneType = uLayerNoiseType[i] > 4.5 && uLayerNoiseType[i] < 5.5;
    float layerHeight = isNoneType ? paint.x : mix(raw * 0.5 + 0.5, paint.x, paint.y);
    float coverage = isNoneType ? paint.y : 1.0;
    float blended = applyBlendMode(composite, layerHeight, uLayerBlendMode[i]);
    composite = mix(composite, blended, uLayerOpacity[i] * coverage);
  }

  gl_FragColor = vec4(vec3(clamp(composite, 0.0, 1.0)), 1.0);
}
