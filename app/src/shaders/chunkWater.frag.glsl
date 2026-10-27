// The chunk's water: Seascape's waves and sea color (shaders/oceanWaves.glsl) on a flat sheet, recolored by the water
// ramp. Far away the waves turn into a soft glare instead of speckles (Bruneton et al. 2010's geometry-to-lighting
// transition, approximated), sporadic whitecaps and a light haze keep it readable, shallow water turns see-through by
// Beer-Lambert (shaders/water.glsl), and foam sits on the shore and the crests. Seascape works in meters.
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

varying vec3 vWorldPosition;

const float METERS_PER_UNIT = 1000.0;
// The haze distance in chunk units (km). Inferred, TUNABLE.
const float HAZE_DISTANCE = 200.0;

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
  gSeaFootprint = length(fwidth(meters)) * SEA_FREQ; // the pixel footprint for band-limiting (Quilez)
  float waveHeight = -sea_height(vec3(meters.x, 0.0, meters.y));
  vec3 surfacePoint = vec3(meters.x, waveHeight, meters.y);
  // Seascape's own distance smoothing: getNormal(p, dot(dist,dist) * EPSILON_NRM), EPSILON_NRM = 0.1 / iResolution.x.
  float normalStep = dot(distMeters, distMeters) * 0.1 / max(uResolution, 1.0);
  vec3 normal = getNormal(surfacePoint, max(normalStep, 0.01));
  // Once the step passes the waves, they are too small to see: flatten the normal and blunt the highlight.
  float far = seaFarFactor(normalStep);
  normal = normalize(mix(normal, vec3(0.0, 1.0, 0.0), far));
  vec3 eye = normalize(toPoint);
  vec3 light = normalize(uLightDirection);
  vec3 color = seaColor(surfacePoint, normal, light, eye, distMeters, seaBase, seaWaterColor, uSkyColor, mix(60.0, FAR_SPECULAR_POWER, far)) * uLightIntensity;

  // Foam: from the wave crests (averaged with distance), the shore edge, and breaking bands in the shallows.
  float foamAmount = clamp(uFoamWidth / 0.05, 0.0, 1.0);
  float breakup = 0.5 + 0.5 * noise(meters * 0.08 + uSeaTime * 0.3);
  float crest = crestFoam(waveHeight, far, meters);
  float shore = max(waterFoam(depthShare, uFoamWidth, breakup), shoreWaveFoam(depthShare, breakup));
  float foam = max(shore, crest) * foamAmount;
  color = mix(color, FOAM_COLOR * (uAmbient + seaDiffuse(normal, light, 1.0)) * uLightIntensity, foam);

  // A light haze toward the sky color with distance, as Seascape fades its sea into the horizon.
  float haze = 1.0 - exp(-length(toPoint) / HAZE_DISTANCE);
  color = mix(color, getSkyColor(vec3(0.0)) * uSkyColor * uLightIntensity, haze);

  // See-through in the shallows, so the shore blends into the ground instead of meeting it at a hard edge.
  float opacity = max(1.0 - waterTransmittance(depthShare, uWaterClarity), foam);
  gl_FragColor = vec4(color, opacity);
}
