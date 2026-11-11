// Where rocks lie on one shown patch of the chunk (props/rockScatter.ts), once per patch bake or placement change: a
// density per cell that the CPU dithers into rocks (Horizon Zero Dawn's GPU placement, Van Muijden 2017).
// R boulders, G small rocks below cliffs, B small rocks along the waterline, all 0 to 1.
uniform sampler2D uPatchHeightMap; // the patch's own bake: heights in green, with a border
uniform float uPatchSamples;
uniform float uPatchBorder;
uniform vec2 uPatchUvMin; // the patch's place on the chunk, chunk uv
uniform vec2 uPatchUvMax;
uniform sampler2D uChunkHeightMap; // the whole chunk, for cliffs past the patch's edge
uniform float uHeightMapGreenChannel; // the whole chunk's format
uniform sampler2D uChunkLakeLevels; // voxel/chunkLakes.ts: R the lake level (raw), B the spill height the sea must reach
uniform float uSeaLevel; // raw
uniform float uMaxHeight; // world units per raw unit; a world unit is a kilometer
uniform float uChunkSize; // world units across the square
uniform float uElevationMin; // raw, the land's range
uniform float uElevationMax;
uniform float uReachTan; // tan of the shadow angle
uniform float uPatchiness;
uniform float uSeed;
uniform float uWorldScale; // props/rockScatter.ts: rock sizes against the landscape
varying vec2 vUv;

// Rockfall reaches out from a cliff to where a line down from it at the shadow angle meets the ground (Evans and Hungr
// 1993; USGS Yosemite report). Sampled along a few directions and distances, out to a share of the patch. TUNABLE
const int REACH_DIRECTIONS = 8;
const int REACH_STEPS = 12;
const float REACH_SHARE = 0.25; // the farthest look, as a share of the patch's width
const float SOURCE_STEEPNESS = 0.234; // 1 - cos 40°: a face rocks fall from. TUNABLE
const float SHORE_BAND_M = 3.0; // how far above the water shore rocks lie. TUNABLE
// Large boulders collect low, at the foot of slopes, and thin out toward the tops: over this share of the land's height
// above the sea (or its lowest ground), as Climate's peak cooling measures it. TUNABLE
const float BOULDER_THIN_FROM = 0.6;
const float BOULDER_THIN_TO = 0.9;
const float FIELD_ROCKS = 0.5; // the density inside a rock field; cliffs and shores add more. TUNABLE
const float FIELD_SIZE_M = 60.0; // a field's breadth in rock-scaled meters (times uWorldScale). TUNABLE

// Raw height at a chunk uv: the patch's own finer bake inside it, the whole chunk's map outside.
float rawAt(vec2 chunkUv) {
  vec2 local = (chunkUv - uPatchUvMin) / (uPatchUvMax - uPatchUvMin);
  if (local.x >= 0.0 && local.y >= 0.0 && local.x <= 1.0 && local.y <= 1.0) {
    return texture2D(uPatchHeightMap, borderedTextureUv(local, uPatchSamples, uPatchBorder)).g;
  }
  vec4 texel = texture2D(uChunkHeightMap, chunkUv);
  return mix(texel.r, texel.g, uHeightMapGreenChannel);
}

// 0 flat, 1 a wall, the rock layer's measure (landLayers.glsl landSurfaceColor), over two of the patch's texels.
float steepnessAt(vec2 chunkUv, float stepUv, float metersPerRaw, float metersPerUv) {
  float dhdx = (rawAt(chunkUv + vec2(stepUv, 0.0)) - rawAt(chunkUv - vec2(stepUv, 0.0))) * metersPerRaw / (2.0 * stepUv * metersPerUv);
  float dhdz = (rawAt(chunkUv + vec2(0.0, stepUv)) - rawAt(chunkUv - vec2(0.0, stepUv))) * metersPerRaw / (2.0 * stepUv * metersPerUv);
  return 1.0 - 1.0 / sqrt(1.0 + dhdx * dhdx + dhdz * dhdz);
}

void main() {
  vec2 uv = mix(uPatchUvMin, uPatchUvMax, vUv);
  float raw = rawAt(uv);
  float metersPerRaw = uMaxHeight * 1000.0;
  float metersPerUv = uChunkSize * 1000.0;
  float patchUv = uPatchUvMax.x - uPatchUvMin.x;
  float stepUv = 2.0 * patchUv / uPatchSamples;

  vec4 lake = texture2D(uChunkLakeLevels, uv);
  float waterLevel = max(lake.b <= uSeaLevel ? uSeaLevel : -1.0e9, lake.r);
  float aboveWaterM = (raw - waterLevel) * metersPerRaw;
  if (aboveWaterM < 0.0) { // no rocks under water
    gl_FragColor = vec4(0.0);
    return;
  }

  // Below a cliff: a steep source above this cell, at least the shadow angle up from it.
  float reachM = REACH_SHARE * patchUv * metersPerUv;
  float hits = 0.0;
  for (int d = 0; d < REACH_DIRECTIONS; d++) {
    float angle = 6.2831853 * float(d) / float(REACH_DIRECTIONS);
    vec2 direction = vec2(cos(angle), sin(angle));
    for (int s = 1; s <= REACH_STEPS; s++) {
      float distanceM = reachM * float(s) / float(REACH_STEPS);
      vec2 sourceUv = uv + direction * distanceM / metersPerUv;
      if (sourceUv.x < 0.0 || sourceUv.y < 0.0 || sourceUv.x > 1.0 || sourceUv.y > 1.0) break;
      float rise = (rawAt(sourceUv) - raw) * metersPerRaw;
      if (rise >= distanceM * uReachTan && steepnessAt(sourceUv, stepUv, metersPerRaw, metersPerUv) > SOURCE_STEEPNESS) {
        hits += 1.0;
        break;
      }
    }
  }
  float talus = clamp(hits * 2.0 / float(REACH_DIRECTIONS), 0.0, 1.0);
  // Rocks rest on the scree below a face, few on the face itself.
  talus *= mix(1.0, 0.3, step(SOURCE_STEEPNESS, steepnessAt(uv, stepUv, metersPerRaw, metersPerUv)));

  float shore = 1.0 - smoothstep(0.0, SHORE_BAND_M, aboveWaterM);

  // Rock fields with empty ground between them: a broad noise from the noise engine (noise.glsl), cut at a threshold;
  // Patchiness raises it, so fields shrink and the ground between them stays bare.
  float fieldNoise = simplexNoise(uv * metersPerUv / (FIELD_SIZE_M * uWorldScale), uSeed);
  float threshold = mix(-1.0, 0.35, uPatchiness);
  float field = smoothstep(threshold, threshold + 0.15, fieldNoise);

  float land = step(0.0, aboveWaterM);
  // Below cliffs and on shores rocks stay, thinner outside fields.
  float rocks = clamp(FIELD_ROCKS * land * field + talus * (0.4 + 0.6 * field), 0.0, 1.0);
  float base = max(uSeaLevel, uElevationMin);
  float altitudeShare = clamp((raw - base) / max(uElevationMax - base, 1e-6), 0.0, 1.0);
  float boulders = rocks * (1.0 - smoothstep(BOULDER_THIN_FROM, BOULDER_THIN_TO, altitudeShare));
  gl_FragColor = vec4(boulders, rocks, shore * (0.3 + 0.7 * field), 1.0);
}
