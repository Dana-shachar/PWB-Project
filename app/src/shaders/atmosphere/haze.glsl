// The chunk's haze, shared by the ground and the water (Quilez, "Better fog"): thicker low down (exponential height
// density, integrated analytically along the ray, after Crytek), tinted toward the sun and from horizon to sky with
// height, with a subtle grain (interleaved gradient noise, Jimenez 2014). Measured from where the haze starts.
uniform vec3 uHazeColor; // the sky's horizon color (atmosphere/)
uniform vec3 uHazeSkyColor; // the sky's top color, for haze high up
uniform float uHazeDensity; // per chunk unit at height 0; 0 is clear
uniform float uHazeStart; // distance from the camera where haze begins: the orbit point, 0 when walking
// Heights are measured from the sea's world height, and the haze thins over a share of the terrain's height, so it holds at
// any chunk size or lift; a fixed 1.2 km scale left it at e^-249 at walking height (Dana: keep it a ratio).
uniform float uHazeFloor;
uniform float uHazeScaleHeight;
// The sky's own sun halo color (skyDome.frag.glsl), so the haze glows toward the sun as the sky does.
const vec3 HAZE_SUN_COLOR = vec3(1.0, 0.96, 0.88);
// Grain strength, as a share of the haze amount. Inferred, TUNABLE.
const float HAZE_GRAIN = 0.04;

float interleavedGradientNoise(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

vec3 applyHaze(vec3 color, vec3 worldPosition, vec3 cameraPosition, vec3 sunDirection) {
  vec3 toPoint = worldPosition - cameraPosition;
  float rayLength = length(toPoint);
  vec3 rayDirection = toPoint / max(rayLength, 1e-6);
  float start = min(uHazeStart, rayLength);
  float hazeFalloff = 1.0 / max(uHazeScaleHeight, 1e-4);
  float startHeight = max(cameraPosition.y + rayDirection.y * start - uHazeFloor, 0.0);
  float travel = rayLength - start;
  // Quilez: (a/b) e^(-b y0) (1 - e^(-b t dy)) / dy; written so a level ray (dy near 0) tends to a t e^(-b y0).
  float slope = rayDirection.y * hazeFalloff;
  float integral = abs(slope) < 1e-4 ? travel : (1.0 - exp(-travel * slope)) / slope;
  float amount = uHazeDensity * exp(-startHeight * hazeFalloff) * integral;
  float haze = 1.0 - exp(-amount);
  haze = clamp(haze + (interleavedGradientNoise(gl_FragCoord.xy) - 0.5) * HAZE_GRAIN * haze, 0.0, 1.0);

  float skyShare = 1.0 - exp(-max(worldPosition.y - uHazeFloor, 0.0) * hazeFalloff);
  vec3 hazeColor = mix(uHazeColor, uHazeSkyColor, skyShare * 0.5);
  float sunAmount = max(dot(rayDirection, normalize(sunDirection)), 0.0);
  hazeColor = mix(hazeColor, HAZE_SUN_COLOR, pow(sunAmount, 8.0));
  return mix(color, hazeColor, haze);
}
