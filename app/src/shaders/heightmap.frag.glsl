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

// fBm (fractal Brownian motion): sums several octaves of the base generator
// at increasing frequency (lacunarity) and decreasing amplitude
// (persistence). Standard formula — verified against
// thebookofshaders.com/13, 2026-09-14 — generalized 2026-09-30 to any base
// generator via evalBaseGenerator, not hardcoded to Perlin.
float fbm3D(vec3 p, float seed, float baseType, float octaves, float persistence, float lacunarity) {
  float value = 0.0;
  float amplitude = 1.0;
  float maxAmplitude = 0.0;
  vec3 samplePoint = p;
  for (int i = 0; i < MAX_OCTAVES; i++) {
    if (i >= int(octaves)) break;
    value += amplitude * evalBaseGenerator(samplePoint, seed, baseType);
    maxAmplitude += amplitude;
    samplePoint *= lacunarity;
    amplitude *= persistence;
  }
  return value / maxAmplitude; // normalize back to roughly -1..1
}

// Domain warp: f(p + h(p)) — displaces the sample coordinate by a noise-
// built offset vector before whatever comes next in the pipeline (the base
// generator, or fbm sampling at that displaced position), for a more
// organic, less grid-aligned look. Standard technique, verified against
// iquilezles.org/articles/warp, 2026-09-14. The offset's three components
// are decorrelated by sampling the base generator at three different fixed
// offsets from p, since there's no vector-valued noise function here.
// Generalized 2026-09-30 to any base generator, same reasoning as fbm3D.
vec3 domainWarpOffset(vec3 p, float seed, float baseType) {
  float x = evalBaseGenerator(p + vec3(5.2, 1.3, 2.8), seed, baseType);
  float y = evalBaseGenerator(p + vec3(1.7, 9.2, 4.1), seed, baseType);
  float z = evalBaseGenerator(p + vec3(8.3, 2.8, 6.5), seed, baseType);
  return vec3(x, y, z);
}

// Returns the warped *position*, not a noise value directly — unlike the
// old domainWarp3D, since whatever comes after in the pipeline (fbm or the
// plain base generator) needs to sample AT this displaced position, not
// receive a pre-computed scalar. poleFalloff tapers the warp to 0 at the
// poles (where vertices are packed closest together) so it doesn't pinch
// the geometry — see ISSUES.md, 2026-09-15.
vec3 domainWarpedPosition(vec3 p, float seed, float baseType, float poleFalloff, float warpStrength) {
  return p + warpStrength * poleFalloff * domainWarpOffset(p, seed, baseType);
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
  float terraceSteps, float warpStrength, float ridgeAmount, float poleFalloff
) {
  vec3 samplePoint = domainWarpOn ? domainWarpedPosition(p, seed, noiseType, poleFalloff, warpStrength) : p;

  float value = octavesOn
    ? fbm3D(samplePoint, seed, noiseType, octaves, persistence, lacunarity)
    : evalBaseGenerator(samplePoint, seed, noiseType);

  if (ridgedOn) value = mix(value, ridge(value), ridgeAmount);
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

void main() {
  // Only these two lines differ between a whole-globe bake and a region
  // bake: which surface point this pixel stands for, and where to read
  // paint for it. Everything below is identical either way.
  vec3 basePosition;
  vec2 paintUV;
  if (uRegionMode > 0.5) {
    vec2 faceCoord = mix(uRegionMin, uRegionMax, vUv);
    basePosition = normalize(cubeFacePoint(uRegionFace, faceCoord.x, faceCoord.y));
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
  for (int i = 0; i < MAX_LAYERS; i++) {
    if (i >= int(uLayerCount)) break;
    // noiseType 4 = none — matches map/heightmap.ts's NOISE_TYPE_INDEX.
    bool isNoneType = uLayerNoiseType[i] > 3.5;
    vec3 p = basePosition * uLayerFrequency[i];
    // 'none' has no generator content of its own — skip evaluating it
    // entirely (raw is unused below for isNoneType anyway), same reasoning
    // as hidden layers being filtered out before this loop runs at all.
    float raw = isNoneType ? 0.0 : evalLayerNoise(
      p, uLayerSeed[i], uLayerNoiseType[i],
      uLayerDomainWarpOn[i] > 0.5, uLayerOctavesOn[i] > 0.5, uLayerRidgedOn[i] > 0.5, uLayerTerraceOn[i] > 0.5,
      uLayerOctaves[i], uLayerPersistence[i], uLayerLacunarity[i],
      uLayerTerraceSteps[i], uLayerWarpStrength[i], uLayerRidgeAmount[i], poleFalloff
    );
    vec2 paint = samplePaintTexture(i, paintUV); // (value, mask)
    // A 'none' layer has no content of its own — true "no fill" — so its
    // height is purely the painted value, with no placeholder gray blended
    // in at all; paint.y (the mask) is applied exactly once, as coverage
    // below, not also folded into layerHeight (that double application
    // caused a compounded/ridged edge at soft stroke boundaries). A noise
    // layer keeps the old per-pixel paint-overrides-noise blend and always
    // has full coverage. See ISSUES.md, 2026-09-22.
    float layerHeight = isNoneType ? paint.x : mix(raw * 0.5 + 0.5, paint.x, paint.y);
    float coverage = isNoneType ? paint.y : 1.0;
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
  gl_FragColor = vec4(clamp(composite, 0.0, 1.0), elevation, 0.0, 1.0);
}
