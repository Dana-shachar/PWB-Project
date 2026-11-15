// A rock's look (props/rockScatter.ts): the ground's color where it lies, less saturated, its hue turned per rock;
// flat faces, lit like the ground (chunk.frag.glsl: fill, wrap diffuse, cast shadow, toon shade, haze).
uniform vec3 uBaseColor;
uniform float uColorByElevation;
uniform vec3 uRampColors[MAX_COLOR_STOPS];
uniform float uRampPositions[MAX_COLOR_STOPS];
uniform float uRampCount;
uniform float uElevationMin;
uniform float uElevationMax;
uniform vec3 uLightDirection;
uniform float uLightIntensity;
uniform float uDiffuseWrap;
uniform float uAmbient;
uniform vec3 uFillColor;
uniform float uShadeStep;
uniform float uShadeFeather;
uniform float uShadeLift;
uniform float uShadeChroma;
uniform float uShadeHueTurn;
uniform float uShadowsEnabled;
uniform sampler2D uChunkHeightMap;
uniform float uHeightMapGreenChannel;
uniform float uChunkSize;
uniform float uMaxHeight;
uniform vec3 uCameraPosition;
uniform float uHueTurn; // degrees from the ground's hue where the rocks' range starts (Props > Hue)
uniform float uHueRange; // degrees the range reaches
uniform float uRockSaturation; // of the ground's (Props > Saturation)
uniform float uShapeSeed;
uniform float uWorldScale; // props/rockScatter.ts: rock sizes against the landscape
varying vec3 vWorldPosition;
varying vec3 vFromEye;
varying vec3 vLocal;
varying float vHeightShare;
varying vec3 vRock;
varying float vSizeMeters;
varying vec2 vChunkUv;

const float ROCK_BRIGHTNESS_SPREAD = 0.3; // brightness varies by this share across rocks. TUNABLE
const float TOON_DETAIL = 0.5; // as chunk.frag.glsl
// The base darkens where the rock meets the ground, so it sits in it (contact shading). TUNABLE
const float BASE_DARKNESS = 0.7;

void main() {
  // Flat faces from the screen derivatives of an eye-relative point (three.js's flatShading uses the view position):
  // world positions here are thousands of km, too big for float precision across one pixel.
  vec3 normal = normalize(cross(dFdx(vFromEye), dFdy(vFromEye)));
  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  if (dot(normal, viewDir) < 0.0) normal = -normal;
  vec3 up = vec3(0.0, 1.0, 0.0);

  vec3 ground = uBaseColor;
  if (uColorByElevation > 0.5) {
    float elevationFraction = (vRock.z - uElevationMin) / max(0.0001, uElevationMax - uElevationMin);
    ground = terrainRampColor(elevationFraction, uRampColors, uRampPositions, int(uRampCount));
  }
  vec3 hsv = rgbToHsv(max(ground, 0.0));
  hsv.x = fract(hsv.x + (uHueTurn + vRock.x * uHueRange) / 360.0);
  hsv.y *= uRockSaturation;
  hsv.z = clamp(hsv.z * (1.0 + (vRock.y - 0.5) * ROCK_BRIGHTNESS_SPREAD), 0.0, 1.0);
  vec3 surfaceColor = hsvToRgb(hsv) * mix(BASE_DARKNESS, 1.0, smoothstep(0.0, 0.5, vHeightShare));

  vec3 lightDir = normalize(uLightDirection);
  float castShadow = 1.0;
  if (uShadowsEnabled > 0.5) castShadow = heightmapShadow(uChunkHeightMap, vChunkUv, lightDir, vRock.z, 0.01, uChunkSize, uMaxHeight, uHeightMapGreenChannel);
  float diffuse = softDiffuse(normal, lightDir, uDiffuseWrap) * uLightIntensity * castShadow;
  vec3 fill = fillLight(normal, up, uFillColor, uAmbient);
  vec3 litColor = surfaceColor * (fill + diffuse);
  float halfLambert = (0.5 * dot(normal, lightDir) + 0.5) * castShadow;
  if (uShadeStep > 0.0) {
    float shadeMask = toonShadeMask(halfLambert, uShadeStep, uShadeFeather);
    vec3 baseColor = surfaceColor * (fill + mix(uLightIntensity, diffuse, TOON_DETAIL));
    vec3 shade = shadeColor(surfaceColor, uShadeHueTurn, uShadeLift, uShadeChroma) + surfaceColor * fill;
    litColor = mix(baseColor, shade, shadeMask);
  }
  // Other rocks' cast shadows.
  float rockShade = rockShadowAmount(uShadeFeather, dot(normal, lightDir));
  litColor = mix(litColor, shadeColor(litColor, uShadeHueTurn, ROCK_SHADOW_DARKNESS, uShadeChroma), rockShade);
  gl_FragColor = vec4(applyHaze(litColor, vWorldPosition, uCameraPosition, uLightDirection), 1.0);
}
