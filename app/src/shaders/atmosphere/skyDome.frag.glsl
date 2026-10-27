// The chunk's sky: three.js's hemisphere-lights sky dome (MIT): mix(bottomColor, topColor, pow(max(h, 0), exponent))
// with h = normalize(position + offset).y, here around the camera (uCenter) and scaled to the dome's radius.
// Additions for this project, inferred and TUNABLE: a soft sun halo, an optional moon disc, and soft flat clouds
// (Sable's simple shapes) drifting with the wind.
uniform vec3 topColor;
uniform vec3 bottomColor;
uniform float offset;
uniform float exponent;
uniform vec3 uCenter;
uniform float uRadius;
uniform vec3 uSunDirection;
uniform float uMoonEnabled;
uniform vec3 uMoonDirection;
uniform vec3 uMoonColor;
uniform float uMoonSize; // radians across
uniform float uCloudCoverage;
uniform vec3 uCloudColor;
uniform vec3 uCloudColor2;
uniform float uCloudSoftness;
uniform vec2 uCloudOffset;
uniform float uGlow; // the atmosphere's Glow: a bright horizon band and a stronger sun halo
uniform float uCloudScale;
uniform float uCloudDetail;
uniform float uCloudFeather;
varying vec3 vWorldPosition;

float skyHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float skyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), u.x), mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float skyFbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uCloudDetail) break;
    sum += skyNoise(p) * amp;
    norm += amp;
    p = p * 2.03 + 17.1;
    amp *= 0.5;
  }
  return sum / max(norm, 0.0001);
}

// The moon: a lit ball with a grainy terminator (sturm_trouper's moon, CC0: the sphere point shifted by noise before
// lighting, terminator smoothstep(-.05, 0), edge smoothstep(1, .98)), soft maria-like patches from thresholded noise
// layers (idea from a Shadertoy night scene, rewritten), and a two-term halo (DimensionAlmios's sky, MIT).
// Strengths inferred, TUNABLE.
const float MOON_ROUGHNESS = 0.18;
const float MOON_GRAIN_SCALE = 9.0;
const float MOON_PATCH_CONTRAST = 0.3;
const float MOON_DARK_SIDE = 0.9; // the dark side is the sky, this much dimmer
vec3 drawMoon(vec3 sky, vec3 dir) {
  vec3 moonDir = normalize(uMoonDirection);
  float radius = uMoonSize * 0.5;
  float moonAngle = acos(clamp(dot(dir, moonDir), -1.0, 1.0));
  // Halo: a tight and a wide falloff around the disc.
  float rim = max(moonAngle - radius, 0.0);
  sky += uMoonColor * (exp(-rim * 12.0) * 0.22 + exp(-rim * 3.5) * 0.06) * uMoonEnabled;
  if (moonAngle > radius * 1.05 || uMoonEnabled < 0.5) return sky;

  vec3 right = normalize(cross(abs(moonDir.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0), moonDir));
  vec3 up = cross(moonDir, right);
  vec3 offsetDir = dir - moonDir * dot(dir, moonDir);
  vec2 disc = vec2(dot(offsetDir, right), dot(offsetDir, up)) / sin(radius);
  float discRadius = length(disc);
  float grain = (skyNoise(disc * MOON_GRAIN_SCALE) - 0.5) * MOON_ROUGHNESS;
  vec3 ball = vec3(disc.x + grain, disc.y, sqrt(max(1.0 - discRadius * discRadius, 0.0)));
  vec3 normal = normalize(right * ball.x + up * ball.y - moonDir * ball.z);
  float lit = smoothstep(-0.05, 0.0, dot(normal, normalize(uSunDirection)));

  float patches = 0.6 * smoothstep(0.2, 0.8, skyNoise(ball.xy * 2.2 + 3.7)) + 0.4 * smoothstep(0.2, 1.0, skyNoise(ball.xy * 5.1 + 11.3));
  vec3 surface = uMoonColor * (1.0 - MOON_PATCH_CONTRAST * patches);
  vec3 moon = mix(sky * MOON_DARK_SIDE, surface, lit);
  return mix(sky, moon, smoothstep(1.0, 0.98, discRadius));
}

void main() {
  vec3 dir = normalize(vWorldPosition - uCenter);
  float h = normalize(dir * uRadius + offset).y;
  vec3 sky = mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0));

  // Glow, seen from the ground: the air's bright band along the horizon (the rim seen from space). Width inferred.
  sky += bottomColor * uGlow * 0.35 * exp(-abs(dir.y) * 8.0);
  // Sun: a wide soft halo, stronger and wider with Glow, and a small bright core.
  float sun = max(dot(dir, normalize(uSunDirection)), 0.0);
  sky += vec3(1.0, 0.96, 0.88) * (pow(sun, 12.0 / (1.0 + uGlow)) * 0.3 * (1.0 + uGlow) + smoothstep(0.9993, 0.9998, sun));

  sky = drawMoon(sky, dir);

  // Clouds: soft flat shapes on a plane above, thinning toward the horizon.
  if (dir.y > 0.0) {
    vec2 uv = (dir.xz / (dir.y + 0.15) * 0.8 + uCloudOffset) * 1.5 * uCloudScale;
    // Feather: a domain warp (Quilez) tears the edges into wisps, as on the planet's clouds.
    uv += (vec2(skyNoise(uv * 1.7 + 3.1), skyNoise(uv * 1.7 + 8.3)) - 0.5) * uCloudFeather * 1.2;
    float shape = skyFbm(uv);
    float threshold = 1.0 - uCloudCoverage;
    float edge = 0.02 + uCloudSoftness * 0.6;
    float cloud = smoothstep(threshold - edge, threshold + edge, shape) * smoothstep(0.0, 0.2, dir.y);
    // Beer's law darkens the thick cores (Schneider 2015), lighter toward the sun.
    float thickness = clamp((shape - threshold) / (edge * 4.0 + 0.15), 0.0, 1.0) * 2.0;
    // Two tones from warped bands, as on the planet's clouds (segue2ant's warp, CC0).
    vec2 toneUv = uv * 0.8;
    for (float i = 1.0; i < 5.0; i += 1.0) {
      toneUv.x += 0.5 * sin(i * toneUv.y);
      toneUv.y += 0.5 * cos(i * toneUv.x);
    }
    vec3 baseColor = mix(uCloudColor, uCloudColor2, 0.5 + 0.5 * sin(toneUv.x + toneUv.y));
    vec3 lit = mix(baseColor * 0.6, baseColor, clamp(0.5 + 0.5 * exp(-thickness), 0.0, 1.0)) * (0.85 + 0.15 * sun);
    sky = mix(sky, lit, cloud * 0.9);
  }
  gl_FragColor = vec4(sky, 1.0);
}
