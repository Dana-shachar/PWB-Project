// Shared by fragment.glsl (the planet) and chunk.frag.glsl (the land chunk):
// a three-stop elevation color ramp with slope darkening, and a heightmap
// self-shadow march. A labelled placeholder for Stage 11's real
// height+climate+biome shader (ROADMAP.md), not that shader itself — this
// is what lets Dana demo relief reading clearly before that stage exists.

// A real multi-stop gradient ramp (the Blender Color Ramp/Figma gradient-
// editor convention, ROADMAP.md Stage 07.4), generalizing the old fixed
// low/mid/high 3-stop lerp. GLSL ES 1.00 has no dynamic-length arrays, so
// this takes a fixed-size array plus how many of its entries are actually
// in use (planet/colorRamp.ts's MAX_COLOR_STOPS, matched exactly by the
// callers' own uRampColors/uRampPositions/uRampCount uniforms). `positions`
// must be ascending (buildRampUniformArrays sorts it). Below the first and
// above the last stop the ramp holds that stop's color; uBaseColor is only
// the flat color used when Color by elevation is off (Dana, 2026-10-21).
const int MAX_COLOR_STOPS = 8;
vec3 terrainRampColor(float elevationFraction, vec3 colors[MAX_COLOR_STOPS], float positions[MAX_COLOR_STOPS], int count) {
  float t = clamp(elevationFraction, 0.0, 1.0);
  if (count <= 1) return colors[0];
  if (t <= positions[0]) return colors[0];
  if (t >= positions[count - 1]) return colors[count - 1];
  for (int i = 0; i < MAX_COLOR_STOPS - 1; i++) {
    if (i >= count - 1) break;
    if (t >= positions[i] && t <= positions[i + 1]) {
      float span = max(0.0001, positions[i + 1] - positions[i]);
      return mix(colors[i], colors[i + 1], (t - positions[i]) / span);
    }
  }
  return colors[count - 1];
}

// One surface normal from a baked heightmap, shared by the planet's patches
// and the land chunk so both light the same way. Central differences of the
// ELEVATION channel (green for the GPU bake, red for voxel's CPU texture, as
// greenChannel selects), `stepUv` apart, crossed with the surface's own
// tangents (dPdu/dPdv, world units per uv) after lifting them by the real
// displacement `amplitude`. Returns a local-space normal; callers apply their
// own normalMatrix. The step is set by the caller as a fixed world length,
// since a step tied to patch size read finer noise as slope ([B34]).
vec3 heightfieldNormal(
  sampler2D heightMap,
  vec2 uv,
  float stepUv,
  float greenChannel,
  vec3 dPdu,
  vec3 dPdv,
  vec3 surfaceNormal,
  float amplitude
) {
  vec4 texelL = texture2D(heightMap, uv - vec2(stepUv, 0.0));
  vec4 texelR = texture2D(heightMap, uv + vec2(stepUv, 0.0));
  vec4 texelD = texture2D(heightMap, uv - vec2(0.0, stepUv));
  vec4 texelU = texture2D(heightMap, uv + vec2(0.0, stepUv));
  float hL = mix(texelL.r, texelL.g, greenChannel);
  float hR = mix(texelR.r, texelR.g, greenChannel);
  float hD = mix(texelD.r, texelD.g, greenChannel);
  float hU = mix(texelU.r, texelU.g, greenChannel);
  float dHdu = (hR - hL) / (2.0 * stepUv);
  float dHdv = (hU - hD) / (2.0 * stepUv);
  vec3 tangentU = dPdu + surfaceNormal * dHdu * amplitude;
  vec3 tangentV = dPdv + surfaceNormal * dHdv * amplitude;
  return normalize(cross(tangentV, tangentU));
}

// Wrap lighting: wrap 0 is plain clamped Lambert, wrap 1 is Valve's squared
// half-Lambert (Mitchell, SIGGRAPH 2006, see REFERENCES.md), so one control
// spans both looks. The exponent of 1 + wrap is this project's own blend
// between the two, not a documented formula. Shared by planet and chunk.
float softDiffuse(vec3 normal, vec3 lightDir, float wrap) {
  float wrapped = clamp((dot(normal, lightDir) + wrap) / (1.0 + wrap), 0.0, 1.0);
  return pow(wrapped, 1.0 + wrap);
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
// How quickly a near-miss gap darkens into full shadow — Quilez's own
// raymarched soft-shadow technique (see REFERENCES.md), adapted from an
// SDF's distance-to-nearest-surface term to this heightfield march's own
// ray-height-minus-sampled-height gap, converted to world units via
// maxHeightWorld before dividing by the real world distance traveled.
// Chosen by eye, not derived, same convention as SHADOW_BIAS above.
const float SHADOW_SOFTNESS = 8.0;
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
  // Soft, not binary: tracks the smallest ratio of (how far the ray sits
  // above the sampled terrain, in world units) to (world distance traveled
  // so far), instead of returning a hard 0 the instant one sample occludes.
  // A near-miss gap softens toward 0 gradually; a deep occlusion saturates
  // there. Same march, same step count, no new samples. See REFERENCES.md.
  float shadow = 1.0;
  for (int i = 1; i <= SHADOW_STEPS; i++) {
    vec2 sampleUV = uv + stepDir * texelStep * float(i);
    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) break;
    vec4 sampledTexel = texture2D(heightMap, sampleUV);
    float sampledRaw = mix(sampledTexel.r, sampledTexel.g, greenChannel);
    float rayRaw = startElevationRaw + riseRawPerStep * float(i) + SHADOW_BIAS;
    float worldDistance = worldStepPerTexel * float(i);
    shadow = min(shadow, SHADOW_SOFTNESS * (rayRaw - sampledRaw) * maxHeightWorld / worldDistance);
    if (shadow < 0.005) break; // already fully shadowed, same early-out Quilez's own reference uses
  }
  return clamp(shadow, 0.0, 1.0);
}
