// The life grid's inputs per cell (biome/lifeGrid.ts), once per terrain, water, climate or sun change:
// R temperature (°C), G moisture (0 dry, 1 saturated, 1.5 underwater; rain, hollows and waterline), B sunlight (0 to 1),
// A waterline wetness alone (1.5 underwater, fading over the wet band above a shore): what aquatic life (algae) reads.
uniform sampler2D uHeightMap; // the chunk's own map (raw elevation)
uniform float uHeightMapGreenChannel;
uniform float uHeightTexel; // one texel of uHeightMap, in uv
uniform sampler2D uChunkLakeLevels; // voxel/chunkLakes.ts: R the lake level (raw), B the spill height the sea must reach
uniform float uSeaLevel; // raw
uniform float uMaxHeight; // world units per raw unit (landChunk.ts); a world unit is a kilometer
uniform float uChunkSize; // world units across the square
uniform float uTemperature; // Climate's, °C
uniform float uPeakCooling; // °C colder on the highest ground than at the shore
uniform float uElevationMin; // raw, the land's range (the ramp's)
uniform float uElevationMax;
uniform float uPoleCooling; // °C colder at the poles
uniform float uLatitude; // the square's latitude, radians
uniform float uRainShare; // Climate's rainfall against the liquid's typical rainfall (0.5 typical)
uniform vec3 uSunDirection; // toward the sun, chunk space
uniform float uShadowsEnabled;
varying vec2 vUv;

// Moisture: rain held where water gathers and drains off slopes (the Topographic Wetness Index's slope term, Beven and
// Kirkby 1979), plus ground just above a waterline. Relative to the land's relief, so any planet's scale works. TUNABLE.
const float WET_SHARE = 0.03; // how far above water the ground stays wet, as a share of the relief
const float SLOPE_DRYING = 3.0; // how fast slopes shed water

// Recessed ground (Unity Terrain Tools' Concavity, "Recessed"): how far a point sits below its neighbors' average at a
// feature size, the height's Laplacian, remapped to 0 to 1. Scale inferred, TUNABLE.
const float LIFE_HOLLOW_STEP_UV = 4.0 / 4096.0; // the feature size: 4 texels of the chunk's map
const float LIFE_HOLLOW_SCALE = 0.02; // the recess that counts as a full hollow, as a share of the feature size
float lifeHollow(sampler2D heightMap, vec2 uv, float greenChannel, float metersPerRaw, float chunkMeters) {
  vec4 c = texture2D(heightMap, uv);
  vec4 e = texture2D(heightMap, uv + vec2(LIFE_HOLLOW_STEP_UV, 0.0));
  vec4 w = texture2D(heightMap, uv - vec2(LIFE_HOLLOW_STEP_UV, 0.0));
  vec4 n = texture2D(heightMap, uv + vec2(0.0, LIFE_HOLLOW_STEP_UV));
  vec4 s = texture2D(heightMap, uv - vec2(0.0, LIFE_HOLLOW_STEP_UV));
  float center = mix(c.r, c.g, greenChannel);
  float around = (mix(e.r, e.g, greenChannel) + mix(w.r, w.g, greenChannel) + mix(n.r, n.g, greenChannel) + mix(s.r, s.g, greenChannel)) * 0.25;
  float recess = (around - center) * metersPerRaw / (LIFE_HOLLOW_STEP_UV * chunkMeters);
  return smoothstep(0.0, LIFE_HOLLOW_SCALE, recess);
}

float rawAt(vec2 uv) {
  vec4 texel = texture2D(uHeightMap, uv);
  return mix(texel.r, texel.g, uHeightMapGreenChannel);
}

void main() {
  vec2 uv = vUv;
  float raw = rawAt(uv);
  float metersPerRaw = uMaxHeight * 1000.0;
  float metersPerUv = uChunkSize * 1000.0;
  float step = uHeightTexel * 2.0;
  float dhdx = (rawAt(uv + vec2(step, 0.0)) - rawAt(uv - vec2(step, 0.0))) * metersPerRaw / (2.0 * step * metersPerUv);
  float dhdz = (rawAt(uv + vec2(0.0, step)) - rawAt(uv - vec2(0.0, step))) * metersPerRaw / (2.0 * step * metersPerUv);
  float slope = length(vec2(dhdx, dhdz)); // tan of the slope angle
  vec3 normal = normalize(vec3(-dhdx, 1.0, -dhdz));

  vec4 lake = texture2D(uChunkLakeLevels, uv);
  float waterLevel = max(lake.b <= uSeaLevel ? uSeaLevel : -1.0e9, lake.r);
  float relief = max(uElevationMax - uElevationMin, 1e-6);
  float aboveWater = (raw - waterLevel) / relief;
  float waterline = aboveWater < 0.0 ? 1.5 : exp(-aboveWater / WET_SHARE);
  float hollow = lifeHollow(uHeightMap, uv, uHeightMapGreenChannel, metersPerRaw, metersPerUv);
  float moisture = aboveWater < 0.0
    ? 1.5
    : clamp(uRainShare / (1.0 + slope * SLOPE_DRYING) + waterline + hollow * 0.3, 0.0, 1.0); // hollows hold water

  // Colder up the land's own relief (Earth's per-km rate breaks on this app's exaggerated planets) and toward the poles.
  float altitudeShare = clamp((raw - uSeaLevel) / max(uElevationMax - uSeaLevel, 1e-6), 0.0, 1.0);
  float temperature = uTemperature - uPeakCooling * altitudeShare - uPoleCooling * sin(abs(uLatitude));

  float sun = max(dot(normal, normalize(uSunDirection)), 0.0);
  if (uShadowsEnabled > 0.5) sun *= heightmapShadow(uHeightMap, uv, normalize(uSunDirection), raw, 0.01, uChunkSize, uMaxHeight, uHeightMapGreenChannel);

  gl_FragColor = vec4(temperature, moisture, sun, waterline);
}
