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

void main() {
  vec3 dir = normalize(vWorldPosition - uCenter);
  float h = normalize(dir * uRadius + offset).y;
  vec3 sky = mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0));

  // Glow, seen from the ground: the air's bright band along the horizon (the rim seen from space). Width inferred.
  sky += bottomColor * uGlow * 0.35 * exp(-abs(dir.y) * 8.0);
  // Sun: a wide soft halo, stronger and wider with Glow, and a small bright core.
  float sun = max(dot(dir, normalize(uSunDirection)), 0.0);
  sky += vec3(1.0, 0.96, 0.88) * (pow(sun, 12.0 / (1.0 + uGlow)) * 0.3 * (1.0 + uGlow) + smoothstep(0.9993, 0.9998, sun));

  // Moon: a soft-edged disc.
  float moonAngle = acos(clamp(dot(dir, normalize(uMoonDirection)), -1.0, 1.0));
  float moon = (1.0 - smoothstep(uMoonSize * 0.45, uMoonSize * 0.5, moonAngle)) * uMoonEnabled;
  sky = mix(sky, uMoonColor, moon);

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
    vec3 lit = mix(uCloudColor * 0.6, uCloudColor, clamp(0.5 + 0.5 * exp(-thickness), 0.0, 1.0)) * (0.85 + 0.15 * sun);
    sky = mix(sky, lit, cloud * 0.9);
  }
  gl_FragColor = vec4(sky, 1.0);
}
