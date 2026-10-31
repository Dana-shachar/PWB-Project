// The planet's clouds: a shell just above the ground, shaped by the repo's 3D simplex noise (shaders/heightmap/
// noise.glsl). Shape: Scale, Detail (noise layers), Swirl (a domain warp, Quilez), Feather (Schneider's erosion: a finer,
// distorted noise subtracted at the cloud edges, Horizon Zero Dawn 2015) and Banding (stretched along latitude lines). Distribution: coverage weighted at the equator, mid-latitudes and poles (NASA MODIS shows a narrow
// equatorial band and two wider mid-latitude ones). Wind moves them in NOAA's three bands per hemisphere (easterlies
// near the equator and poles, westerlies between about 35 and 60 degrees), looped with a two-phase blend (Vlachos) so
// the bands never shear apart. Lighting: Beer's law E = e^-d with Schneider's powder term 1 - e^(-2d), seen toward the
// sun (Horizon Zero Dawn, SIGGRAPH 2015), and softly wrapped sunlight for a flatter, 2.5D look.
// Band speed, latitude widths, warp strength and light amounts inferred, TUNABLE.
uniform float uCloudCoverage;
uniform vec3 uCloudColor;
uniform vec3 uCloudColor2;
uniform float uCloudSoftness;
uniform float uCloudTime; // advances faster in stronger wind
uniform float uCloudLayer; // which stacked shell, 0 the lowest: higher shells show only the thicker cores
const float CLOUD_SHELL_CORE = 0.05; // how much higher each shell's threshold sits. Inferred, TUNABLE.
const float CLOUD_SHELL_OPACITY = 0.55; // each shell's share; stacked, the cores reach about the old single layer's
uniform float uCloudScale;
uniform float uCloudDetail;
uniform float uCloudFeather;
uniform float uCloudSwirl;
uniform float uCloudBanding;
uniform float uCloudEquator;
uniform float uCloudMidLatitudes;
uniform float uCloudPoles;
uniform float uCloudDistributionStrength; // 0 scattered everywhere, 1 only in the favored latitudes
uniform vec3 uLightDirection;
uniform float uAmbient;
uniform vec3 uCameraPosition;
varying vec3 vSphereDirection;
varying vec3 vWorldPosition;

const float BAND_SWING = 0.4; // radians each band swings over one loop
const float GLOBAL_DRIFT = 0.01; // radians per unit of cloud time: the whole layer travels around the planet
const float LOOP_RATE = 0.01; // loops per unit of cloud time
const float LIGHT_WRAP = 0.5;

float bandSpeed(float latitude) {
  float absLat = abs(latitude);
  float westerly = smoothstep(25.0, 35.0, absLat) * (1.0 - smoothstep(55.0, 65.0, absLat));
  return mix(-1.0, 1.0, westerly);
}

float gaussian(float x, float center, float width) {
  float t = (x - center) / width;
  return exp(-t * t);
}

float cloudFbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uCloudDetail) break;
    sum += simplexNoise3D(p, 3.0) * amp;
    norm += amp;
    p = p * 2.03 + 7.7;
    amp *= 0.5;
  }
  return sum / max(norm, 0.0001) * 0.5 + 0.5;
}

// Feather follows Schneider: "erode the base cloud shape by subtracting the second 3d texture at the edges", that
// texture "distorted by curl noise" for turbulent wisps. A small domain warp stands in for the curl noise here (an
// approximation), and the erosion fades out inside the cloud so only the edges are worn. Frequencies, the edge zone
// and the strength inferred, TUNABLE.
const float FEATHER_FREQUENCY = 6.0;
const float FEATHER_EDGE_ZONE = 0.25;
float cloudShape(vec3 dir, float angle, float threshold) {
  float ca = cos(angle);
  float sa = sin(angle);
  vec3 moved = vec3(ca * dir.x - sa * dir.z, dir.y, sa * dir.x + ca * dir.z);
  float stretch = mix(1.0, 0.2, uCloudBanding);
  vec3 p = vec3(moved.x * stretch, moved.y, moved.z * stretch) * 3.0 * uCloudScale;
  if (uCloudSwirl > 0.0) {
    vec3 warp = vec3(simplexNoise3D(p * 1.7, 11.0), simplexNoise3D(p * 1.7, 23.0), simplexNoise3D(p * 1.7, 37.0));
    p += warp * uCloudSwirl * 0.6;
  }
  float base = cloudFbm(p);
  if (uCloudFeather <= 0.0 || base < threshold - 0.3) return base; // detail only near clouds, as in the talk
  vec3 q = p * FEATHER_FREQUENCY;
  q += vec3(simplexNoise3D(q * 0.5, 41.0), simplexNoise3D(q * 0.5, 53.0), 0.0) * 0.8;
  float detail = simplexNoise3D(q, 61.0) * 0.5 + 0.5;
  float edgeness = 1.0 - clamp((base - threshold) / FEATHER_EDGE_ZONE, 0.0, 1.0);
  return base - detail * uCloudFeather * 0.35 * edgeness;
}

// Two tones: warped bands mix in the second color, after segue2ant's "Simple Spatial Planet" (CC0): its sine and cosine
// warp, sampled from two opposite projections blended to hide the seam. Band counts inferred, TUNABLE.
const float TONE_PI = 3.14159265;
const vec2 TONE_SCALE = vec2(8.0, 3.0);
float toneBands(vec2 uv) {
  for (float i = 1.0; i < 5.0; i += 1.0) {
    uv.x += 0.5 * sin(i * uv.y);
    uv.y += 0.5 * cos(i * uv.x);
  }
  return 0.5 + 0.5 * sin(uv.x + uv.y);
}
vec2 toneSphereUv(vec3 dir) {
  return vec2(atan(dir.y, length(dir.xz)) / TONE_PI + 0.5, (atan(dir.x, dir.z) + TONE_PI) / (2.0 * TONE_PI));
}
float cloudTone(vec3 dir, float angle) {
  float ca = cos(angle);
  float sa = sin(angle);
  vec3 moved = vec3(ca * dir.x - sa * dir.z, dir.y, sa * dir.x + ca * dir.z);
  vec2 across = moved.xz / max(length(moved.xz), 1e-4);
  float blend = (-across.y + 1.0) / 2.0;
  vec2 scale = TONE_SCALE * uCloudScale;
  return mix(toneBands(toneSphereUv(moved) * scale), toneBands(toneSphereUv(-moved) * scale), blend);
}

void main() {
  vec3 dir = normalize(vSphereDirection);
  float latitude = degrees(asin(clamp(dir.y, -1.0, 1.0)));
  float absLat = abs(latitude);

  float phase0 = fract(uCloudTime * LOOP_RATE);
  float phase1 = fract(uCloudTime * LOOP_RATE + 0.5);
  float gather = max(max(uCloudEquator * gaussian(latitude, 0.0, 12.0), uCloudMidLatitudes * gaussian(absLat, 50.0, 15.0)), uCloudPoles * gaussian(absLat, 90.0, 18.0));
  // Latitude nudges where clouds form rather than gating them, so scattered clouds remain between the bands.
  float threshold = 1.0 - uCloudCoverage * mix(1.0, gather, uCloudDistributionStrength) + uCloudLayer * CLOUD_SHELL_CORE;
  float edge = 0.02 + uCloudSoftness * 0.5;
  float speed = bandSpeed(latitude) * BAND_SWING;
  float drift = uCloudTime * GLOBAL_DRIFT;
  float shape = mix(cloudShape(dir, drift + speed * phase0, threshold), cloudShape(dir, drift + speed * phase1, threshold), abs(0.5 - phase0) / 0.5);
  float cloud = smoothstep(threshold - edge, threshold + edge, shape);

  // Thickness from how far the noise rises past the edge; Beer's law darkens thick cores, powder darkens the edges
  // facing the sun as seen toward it.
  // Thickness within each cloud's own edge zone, so a fully overcast sky isn't all "thick".
  float thickness = clamp((shape - threshold) / (edge * 4.0 + 0.15), 0.0, 1.0) * 2.0;
  vec3 light = normalize(uLightDirection);
  vec3 toEye = normalize(uCameraPosition - vWorldPosition);
  float beer = exp(-thickness);
  float powder = 1.0 - exp(-2.0 * thickness);
  float towardSun = max(dot(-toEye, light), 0.0);
  float energy = mix(beer, beer * powder * 2.0, towardSun);
  float sunlit = clamp((dot(dir, light) + LIGHT_WRAP) / (1.0 + LIGHT_WRAP), 0.0, 1.0);
  vec3 baseColor = mix(uCloudColor, uCloudColor2, cloudTone(dir, drift));
  vec3 shadowColor = baseColor * 0.55;
  // The darkest a core gets is capped at halfway to the shadow color.
  vec3 color = mix(shadowColor, baseColor, clamp(0.5 + 0.5 * energy, 0.0, 1.0)) * (uAmbient + sunlit);
  gl_FragColor = vec4(color, cloud * CLOUD_SHELL_OPACITY);
}
