// The chunk's water: Seascape's waves and sea color (shaders/water/oceanWaves.glsl) on a flat sheet, recolored by the water
// ramp. Far away the waves turn into a soft glare instead of speckles (Bruneton et al. 2010's geometry-to-lighting
// transition, approximated), large Gerstner waves add moving light and dark variance, a light haze fades the far water,
// shallow water turns see-through by Beer-Lambert (shaders/water/water.glsl), and foam sits on the shore, the surf and the
// crests. Seascape works in meters.
uniform sampler2D uChunkHeightMap;
uniform float uMaxHeight;
uniform float uHeightBase; // world height = (raw + uHeightBase) * uMaxHeight
uniform float uHeightMapGreenChannel;
uniform float uChunkSize;
uniform float uSeaLevel;
uniform float uWaterDeepest; // the planet's lowest height, so depthShare matches the planet view
uniform vec3 uWaterRampColors[MAX_COLOR_STOPS];
uniform float uWaterRampPositions[MAX_COLOR_STOPS];
uniform float uWaterRampCount;
uniform float uWaterClarity;
uniform float uFoamWidth;
uniform sampler2D uChunkLakeLevels; // voxel/chunkLakes.ts: B is the spill height the sea must reach
uniform float uWaveScale; // multiplies Seascape's wavelengths
uniform float uResolution; // the view's width in pixels, for Seascape's distance smoothing
uniform vec3 uSkyColor;
uniform vec3 uLightDirection;
uniform float uAmbient;
uniform float uLightIntensity;
uniform vec3 uCameraPosition;
// Haze uniforms live in shaders/atmosphere/haze.glsl.

varying vec3 vWorldPosition;
varying float vLake; // above 0 on a lake (chunkWater.vert.glsl)

const float METERS_PER_UNIT = 1000.0;
const float CHUNK_SURF_TILT = 0.5; // softens the sky's hard ribbons on the surf. Inferred, TUNABLE.
const float SHORE_FOAM_REST = 0.6; // the foam that stays at the shore between waves. Inferred, TUNABLE.
// How far apart the surf's slope samples are, as a share of the chunk. Inferred, TUNABLE.
const float SURF_SLOPE_UV_STEP = 0.002;

const float SHORE_FOAM_REACH_METERS = 30.0; // how far foam reaches from the waterline at the Foam slider's default. Inferred, TUNABLE.
const float FOAM_MIN_PIXELS = 9.0; // the shore band's narrowest width on screen; foam shows in about its inner third. Inferred, TUNABLE
const float LAKE_FOAM_STRENGTH = 0.6; // lakes foam like the sea's beaches, weaker (Dana). Inferred, TUNABLE
const float LAKE_FOAM_PIXELS = 4.0; // the lake's shore line, in pixels at any distance. Inferred, TUNABLE

uniform sampler2D uRippleMap; // planet/rippleMap.ts
uniform float uRippleOn;
const float RIPPLE_TILE_SHARE = 0.08; // a ripple tile's size over the pixel's distance. Inferred, TUNABLE
const float LAKE_RIPPLE_STRENGTH = 0.6; // strong enough to read at a distance (Dana). Inferred, TUNABLE

// The planet's two ripple layers, scrolling across each other (planetPatch.frag.glsl).
vec2 lakeRipple(vec2 uv) {
  vec2 layerA = texture2D(uRippleMap, uv + vec2(0.02, 0.01) * uSeaClock).xy;
  vec2 layerB = texture2D(uRippleMap, uv * 0.7 - vec2(0.013, 0.021) * uSeaClock).xy;
  return (layerA * 2.0 - 1.0) + (layerB * 2.0 - 1.0);
}

void main() {
  vec2 chunkUv = vWorldPosition.xz / uChunkSize + 0.5;
  vec4 heightTexel = texture2D(uChunkHeightMap, chunkUv);
  float groundRaw = mix(heightTexel.r, heightTexel.g, uHeightMapGreenChannel);
  // On a lake the sheet's own height is the surface, so the fine ground cuts the shore. Elsewhere, the sea.
  float waterSurface = vLake > 0.0 ? vWorldPosition.y / max(uMaxHeight, 0.0001) - uHeightBase : uSeaLevel;
  if (groundRaw >= waterSurface) discard;
  // The sea shows only where it can reach, never in a dip below it with no way in (B, the spill height).
  if (vLake <= 0.0 && texture2D(uChunkLakeLevels, chunkUv).b > uSeaLevel) discard;
  float depthShare = (waterSurface - groundRaw) / max(0.0001, uSeaLevel - uWaterDeepest);
  // Inland water deepens away from the sea, as on the planet, so a lake reads as water. Only shore foam uses the true
  // depth, or a lake never reads shallow at its shore and never foams (measured, 2026-11-04).
  float colorDepth = depthShare;
  if (waterSurface > uSeaLevel) colorDepth = max(depthShare, min(INLAND_MIN_DEPTH, (waterSurface - uSeaLevel) * INLAND_DEPTH_RAMP));
  vec3 seaBase = terrainRampColor(waterRampPosition(colorDepth, uWaterClarity), uWaterRampColors, uWaterRampPositions, int(uWaterRampCount));
  vec3 seaWaterColor = uWaterRampColors[0];

  // Seascape on the flat sheet, in meters, its waves stretched by Wave size.
  vec3 toPoint = vWorldPosition - uCameraPosition;
  vec3 distMeters = toPoint * METERS_PER_UNIT / uWaveScale;
  vec2 meters = vWorldPosition.xz * METERS_PER_UNIT / uWaveScale;
  float footprint = length(fwidth(meters));
  gSeaFootprint = footprint * SEA_FREQ; // the pixel footprint for band-limiting (Quilez)
  float fetch = seaFetchScale(colorDepth);
  // Open water rougher than enclosed water; calm wind flattens the sea (stronger wind lengthens it, via uWaveScale).
  gSeaAmplitude = fetch * min(1.0, seaWindScale());
  float waveHeight = -sea_height(vec3(meters.x, 0.0, meters.y));
  vec3 surfacePoint = vec3(meters.x, waveHeight, meters.y);
  // Seascape's own distance smoothing: getNormal(p, dot(dist,dist) * EPSILON_NRM), EPSILON_NRM = 0.1 / iResolution.x.
  float normalStep = dot(distMeters, distMeters) * 0.1 / max(uResolution, 1.0);
  vec3 normal = getNormal(surfacePoint, max(normalStep, 0.01));
  // Once the step passes the waves, they are too small to see: flatten the normal and blunt the highlight.
  float far = seaFarFactor(normalStep);
  normal = normalize(mix(normal, vec3(0.0, 1.0, 0.0), far));
  // Large Gerstner waves under Seascape's, for slow light and dark variance.
  vec3 variance = waterVariance(meters, footprint, fetch);
  normal = normalize(normal + vec3(-variance.x, 0.0, -variance.y));
  // Lakes always ripple, even where the meter-sized waves are too small to see: the planet's scrolling ripple layers, sized
  // as a ratio of the view, with two sizes blended so zooming never pops.
  if (vLake > 0.0 && uRippleOn > 0.5) {
    // Sized by this pixel's own distance, not the chunk's nearest point: in walk mode that was the eye height, so the
    // ripples shrank to centimeters and blurred flat across the lake (2026-11-04).
    float sizeLevel = log2(max(length(toPoint) * RIPPLE_TILE_SHARE, 1e-4));
    float rippleTile = exp2(floor(sizeLevel));
    vec2 tilt = mix(lakeRipple(vWorldPosition.xz / rippleTile), lakeRipple(vWorldPosition.xz / (rippleTile * 2.0)), fract(sizeLevel));
    normal = normalize(normal + vec3(tilt.x, 0.0, tilt.y) * LAKE_RIPPLE_STRENGTH);
  }
  // Surf rolling toward the shore, lit as a wave and leaving foam behind its crest.
  // The depth's slope from the ground's heights at neighboring points, per unit of the waves' coordinates.
  // Central differences: a one-sided slope jumps across seabed ridges, which drew the surf with sharp corners ([B110]).
  vec2 uvStep = vec2(SURF_SLOPE_UV_STEP, 0.0);
  vec4 texelXp = texture2D(uChunkHeightMap, chunkUv + uvStep.xy);
  vec4 texelXm = texture2D(uChunkHeightMap, chunkUv - uvStep.xy);
  vec4 texelZp = texture2D(uChunkHeightMap, chunkUv + uvStep.yx);
  vec4 texelZm = texture2D(uChunkHeightMap, chunkUv - uvStep.yx);
  float groundDeltaX = mix(texelXp.r - texelXm.r, texelXp.g - texelXm.g, uHeightMapGreenChannel) * 0.5;
  float groundDeltaZ = mix(texelZp.r - texelZm.r, texelZp.g - texelZm.g, uHeightMapGreenChannel) * 0.5;
  float seaUnitsPerStep = SURF_SLOPE_UV_STEP * uChunkSize * METERS_PER_UNIT / uWaveScale;
  vec2 depthGradient = -vec2(groundDeltaX, groundDeltaZ) / max(0.0001, uSeaLevel - uWaterDeepest) / seaUnitsPerStep;
  vec3 surf = surfWave(colorDepth, meters, 0.0, depthGradient, footprint) * (1.0 - far);
  normal = normalize(normal + vec3(-surf.x, 0.0, -surf.y) * CHUNK_SURF_TILT);
  vec3 eye = normalize(toPoint);
  vec3 light = normalize(uLightDirection);
  vec3 color = seaColor(surfacePoint, normal, light, eye, distMeters, seaBase, seaWaterColor, uSkyColor, far, seaSlopeVariance(fetch)) * uLightIntensity;

  // Foam: from the wave crests (averaged with distance), the shore edge, and the surf; never fully white.
  float foamAmount = clamp(uFoamWidth / 0.05, 0.0, 1.0);
  float crest = max(crestFoam(waveHeight, far, meters), variance.z * (1.0 - far)); // plus foam where the big waves pinch
  // Foam by distance from the shore, not depth alone (the shore-wave source's own measure): depth over the seabed's
  // slope, a first-order estimate, so a gentle beach keeps a narrow band instead of a wide sheet ([B83]).
  float shoreMeters = depthShare / max(length(depthGradient), 1e-4) * uWaveScale;
  // Lake bottoms are bumpy, so the slope estimate fails there: distance to the waterline in pixels from how fast the
  // depth changes on screen instead (value over its screen derivative, the outline trick), in meters.
  float lakeShorePixels = depthShare / max(fwidth(depthShare), 1e-6);
  if (vLake > 0.0) shoreMeters = lakeShorePixels * footprint * uWaveScale;
  // The band is a few pixels wide at any distance (relative to the view, Dana), or its real width up close; the Foam
  // slider scales both. footprint is a pixel's size in the waves' units.
  float shoreReach = max(max(SHORE_FOAM_REACH_METERS, FOAM_MIN_PIXELS * footprint * uWaveScale) * uFoamWidth / 0.05, 0.001);
  // Saturation ends at the reach: depth alone let shore foam cover every shallow flat (measured, [B83]).
  float shoreFade = 1.0 - smoothstep(shoreReach, 2.0 * shoreReach, shoreMeters);
  float saturation = max(SHORE_FOAM_REST * clamp(1.0 - shoreMeters / (2.0 * shoreReach), 0.0, 1.0), gSurfTrail * (1.0 - far) * shoreFade);
  float shore = clamp((saturation - foamMask(meters, footprint)) * FOAM_FADE_GAIN, 0.0, 1.0) * foamTexture(meters, footprint);
  // A lake's beach foam, read from afar too: a soft line a few pixels wide along the waterline, textured up close.
  if (vLake > 0.0) shore = max(shore, (1.0 - smoothstep(0.0, LAKE_FOAM_PIXELS, lakeShorePixels)) * foamTexture(meters, footprint));
  float foam = max(shore, crest) * foamAmount * FOAM_OPACITY * (vLake > 0.0 ? LAKE_FOAM_STRENGTH : 1.0);
  // Foam adds to the water as in Parberry et al. (screen, so it never clips), taking the sky at a slant, so shine stays.
  vec3 foamColor = mix(FOAM_COLOR * (uAmbient + seaDiffuse(normal, light, 1.0)) * uLightIntensity, uSkyColor, waterFresnel(normal, -eye));
  color = 1.0 - (1.0 - clamp(color, 0.0, 1.0)) * (1.0 - clamp(foamColor, 0.0, 1.0) * foam);

  color = applyHaze(color, vWorldPosition, uCameraPosition, uLightDirection);

  // See-through in the shallows, so the shore blends into the ground instead of meeting it at a hard edge. Only the
  // light the surface doesn't reflect passes (Schlick: reflect F, transmit 1 - F), so low views read as water.
  float opacity = max(1.0 - (1.0 - waterFresnel(normal, -eye)) * waterTransmittance(colorDepth, uWaterClarity), foam);
  gl_FragColor = vec4(color, opacity);
}
