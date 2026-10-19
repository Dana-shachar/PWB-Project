// Shared by fragment.glsl (the planet) and chunk.frag.glsl (the land chunk):
// a three-stop elevation color ramp with slope darkening, and a heightmap
// self-shadow march. A labelled placeholder for Stage 11's real
// height+climate+biome shader (ROADMAP.md), not that shader itself — this
// is what lets Dana demo relief reading clearly before that stage exists.

// Blends low -> mid -> high by how high this point is, relative to the
// view's own min/max (each caller works out elevationFraction in its own
// units — see fragment.glsl/chunk.frag.glsl). "Low" is always the surface's
// own uBaseColor at the call site, not a separate control — one fewer color
// than the three-stop name suggests, since the base color already serves
// that role (Dana, 2026-10-13: "the base color should just serve as the low
// elevation color... no need for low elevation color").
vec3 terrainRampColor(float elevationFraction, vec3 colorLow, vec3 colorMid, vec3 colorHigh) {
  float t = clamp(elevationFraction, 0.0, 1.0);
  return t < 0.5 ? mix(colorLow, colorMid, t * 2.0) : mix(colorMid, colorHigh, (t - 0.5) * 2.0);
}

// Heightmap self-shadowing over a flat XZ patch: steps toward the light in
// the plane, sampling the heightmap along the way, and reports shadow if any
// sample sits above where a straight ray to the light would be at that
// point. The known terrain self-shadow technique — see REFERENCES.md.
// Flat-plane only for now; the land chunk is flat, so this is exact there.
// The planet's curved surface needs the same idea projected onto its local
// tangent plane, deferred as its own follow-up rather than shipped unverified
// alongside this (Dana, 2026-10-13 — chunk lighting was the actual complaint).
const int SHADOW_STEPS = 16;
// Absorbs the heightmap's own texel-to-texel roughness so a neighboring
// bump from the terrain's own noise isn't mistaken for an occluder —
// "shadow acne" and its standard fix. The basic version of this technique
// (the source this was built from) has no such tolerance, which is exactly
// what produced it (Dana, 2026-10-13: "shadows look awful"). TODO(DS):
// chosen by eye against this terrain's typical per-layer Height values, not
// derived — the usual tradeoff with any shadow bias is that too little
// leaves acne and too much detaches the shadow from its own object.
// See REFERENCES.md.
const float SHADOW_BIAS = 0.04;
float heightmapShadow(
  sampler2D heightMap,
  vec2 uv,
  vec3 lightDir,
  float startElevationRaw,
  float texelStep,
  float worldPerUV, // world units spanned by the patch, uv 0..1 across it
  float maxHeightWorld, // world-unit height a raw value of 0.5 (this patch's maximum) displaces to
  // true (1.0) when heightMap is the GPU bake format (elevation in green),
  // false (0.0) for a plain single-channel CPU texture (elevation in red) —
  // see chunk.frag.glsl's uHeightMapGreenChannel, ISSUES.md [B32]. The
  // planet doesn't call this (chunk-only for now), but the parameter is
  // required either way, GLSL ES 1.00 has no default argument values.
  float greenChannel
) {
  float horizontalLen = length(lightDir.xz);
  if (horizontalLen < 0.001) return 1.0; // light straight overhead — no raking shadow to compute
  vec2 stepDir = lightDir.xz / horizontalLen;
  float worldStepPerTexel = texelStep * worldPerUV;
  // How much the ray's own height rises per texel stepped, in the same raw
  // elevation units the heightmap stores — converts a world-space rise via
  // the same (raw + 0.5) * maxHeightWorld convention smoothMesh.ts builds
  // the geometry with, so the ray and the mesh agree on what "height" means.
  float riseRawPerStep = (worldStepPerTexel * lightDir.y / horizontalLen) / max(0.0001, maxHeightWorld);
  for (int i = 1; i <= SHADOW_STEPS; i++) {
    vec2 sampleUV = uv + stepDir * texelStep * float(i);
    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) break;
    vec4 sampledTexel = texture2D(heightMap, sampleUV);
    float sampledRaw = mix(sampledTexel.r, sampledTexel.g, greenChannel);
    float rayRaw = startElevationRaw + riseRawPerStep * float(i) + SHADOW_BIAS;
    if (sampledRaw > rayRaw) return 0.0;
  }
  return 1.0;
}
