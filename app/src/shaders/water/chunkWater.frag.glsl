// The chunk's water: Seascape's waves and sea color (shaders/water/oceanWaves.glsl) on a flat sheet, recolored by the water
// ramp. Far away the waves turn into a soft glare instead of speckles (Bruneton et al. 2010's geometry-to-lighting
// transition, approximated), large Gerstner waves add moving light and dark variance, a light haze fades the far water,
// shallow water turns see-through by Beer-Lambert (shaders/water/water.glsl), and foam sits on the shore, the surf and the
// crests. Seascape works in meters.
uniform sampler2D uChunkHeightMap;
uniform float uHeightMapGreenChannel;
uniform float uChunkSize;
uniform float uSeaLevel;
uniform float uWaterDeepest; // the planet's lowest height, so depthShare matches the planet view
uniform vec3 uWaterRampColors[MAX_COLOR_STOPS];
uniform float uWaterRampPositions[MAX_COLOR_STOPS];
uniform float uWaterRampCount;
uniform float uWaterClarity;
uniform float uFoamWidth;
uniform float uWaveScale; // multiplies Seascape's wavelengths
uniform float uResolution; // the view's width in pixels, for Seascape's distance smoothing
uniform vec3 uSkyColor;
uniform vec3 uLightDirection;
uniform float uAmbient;
uniform float uLightIntensity;
uniform vec3 uCameraPosition;
uniform vec3 uHazeColor; // the sky's horizon color (atmosphere/)
uniform float uHazeDensity; // per chunk unit; 0 is clear
uniform float uHazeStart; // distance from the camera where haze begins: the orbit point, 0 when walking

varying vec3 vWorldPosition;

const float METERS_PER_UNIT = 1000.0;
// How far apart the surf's slope samples are, as a share of the chunk. Inferred, TUNABLE.
const float SURF_SLOPE_UV_STEP = 0.002;

void main() {
  vec2 chunkUv = vWorldPosition.xz / uChunkSize + 0.5;
  vec4 heightTexel = texture2D(uChunkHeightMap, chunkUv);
  float groundRaw = mix(heightTexel.r, heightTexel.g, uHeightMapGreenChannel);
  if (groundRaw >= uSeaLevel) discard;
  float depthShare = (uSeaLevel - groundRaw) / max(0.0001, uSeaLevel - uWaterDeepest);
  vec3 seaBase = terrainRampColor(waterRampPosition(depthShare, uWaterClarity), uWaterRampColors, uWaterRampPositions, int(uWaterRampCount));
  vec3 seaWaterColor = uWaterRampColors[0];

  // Seascape on the flat sheet, in meters, its waves stretched by Wave size.
  vec3 toPoint = vWorldPosition - uCameraPosition;
  vec3 distMeters = toPoint * METERS_PER_UNIT / uWaveScale;
  vec2 meters = vWorldPosition.xz * METERS_PER_UNIT / uWaveScale;
  float footprint = length(fwidth(meters));
  gSeaFootprint = footprint * SEA_FREQ; // the pixel footprint for band-limiting (Quilez)
  float fetch = seaFetchScale(depthShare);
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
  // Surf rolling toward the shore, lit as a wave and leaving foam behind its crest.
  float breakup = 0.5 + 0.5 * noise(meters * 0.08 + uSeaTime * 0.3);
  // The depth's slope from the ground's heights at neighboring points, per unit of the waves' coordinates.
  vec2 uvStep = vec2(SURF_SLOPE_UV_STEP, 0.0);
  float groundX = mix(texture2D(uChunkHeightMap, chunkUv + uvStep.xy).r, texture2D(uChunkHeightMap, chunkUv + uvStep.xy).g, uHeightMapGreenChannel);
  float groundZ = mix(texture2D(uChunkHeightMap, chunkUv + uvStep.yx).r, texture2D(uChunkHeightMap, chunkUv + uvStep.yx).g, uHeightMapGreenChannel);
  float seaUnitsPerStep = SURF_SLOPE_UV_STEP * uChunkSize * METERS_PER_UNIT / uWaveScale;
  vec2 depthGradient = -vec2(groundX - groundRaw, groundZ - groundRaw) / max(0.0001, uSeaLevel - uWaterDeepest) / seaUnitsPerStep;
  vec3 surf = surfWave(depthShare, meters, breakup, depthGradient, footprint) * (1.0 - far);
  normal = normalize(normal + vec3(-surf.x, 0.0, -surf.y));
  vec3 eye = normalize(toPoint);
  vec3 light = normalize(uLightDirection);
  vec3 color = seaColor(surfacePoint, normal, light, eye, distMeters, seaBase, seaWaterColor, uSkyColor, far, seaSlopeVariance(fetch)) * uLightIntensity;

  // Foam: from the wave crests (averaged with distance), the shore edge, and the surf; never fully white.
  float foamAmount = clamp(uFoamWidth / 0.05, 0.0, 1.0);
  float crest = max(crestFoam(waveHeight, far, meters), variance.z * (1.0 - far)); // plus foam where the big waves pinch
  float shore = max(waterFoam(depthShare, uFoamWidth, breakup), surf.z);
  float foam = max(shore, crest) * foamAmount * FOAM_OPACITY;
  color = mix(color, FOAM_COLOR * (uAmbient + seaDiffuse(normal, light, 1.0)) * uLightIntensity, foam);

  // Haze toward the sky's horizon color with distance: three.js's FogExp2, 1 - exp(-(density * distance)^2).
  // Measured from the orbit point, so the chunk in view stays clear and only what lies beyond it fades.
  float hazeDistance = uHazeDensity * max(length(toPoint) - uHazeStart, 0.0);
  color = mix(color, uHazeColor, 1.0 - exp(-hazeDistance * hazeDistance));

  // See-through in the shallows, so the shore blends into the ground instead of meeting it at a hard edge.
  float opacity = max(1.0 - waterTransmittance(depthShare, uWaterClarity), foam);
  gl_FragColor = vec4(color, opacity);
}
