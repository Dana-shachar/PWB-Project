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
uniform float uAmbient; // the Scene lighting, for the moon
uniform float uLightIntensity;
uniform float uDiffuseWrap;
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

// The moon, after Dana's No Man's Sky references (REFERENCES.md): a disc washed toward the sky so the sky shows through,
// bumpy cracked relief from cellular noise (Worley F1, The Book of Shaders ch. 12) used as a bump map so it catches the
// light, soft low-contrast light (the land's wrapped light, lifted), a thin bright rim strongest toward the sun, sturm_trouper's
// crisp edge (CC0) and a two-term halo (DimensionAlmios's sky, MIT). Strengths inferred, TUNABLE.
const float MOON_OPACITY = 0.75;
const float MOON_SKY_TINT = 0.25;
const float MOON_LIGHT_LIFT = 0.45; // extra fill light, so the dark side fades instead of going black
const float MOON_BUMP = 0.35;
const float MOON_RIM = 0.8;
float moonDiffuse(vec3 normal, vec3 lightDir, float wrap) {
  float wrapped = clamp((dot(normal, lightDir) + wrap) / (1.0 + wrap), 0.0, 1.0);
  return pow(wrapped, 1.0 + wrap);
}
// Distance to the nearest of one random point per cell (Worley F1).
float moonCells(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  float nearest = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = vec2(skyHash(cell + neighbor), skyHash(cell + neighbor + 17.3));
      nearest = min(nearest, length(neighbor + point - local));
    }
  }
  return nearest;
}
// Relief: rounded bumps from two cell sizes plus soft mottling.
float moonRelief(vec2 uv) {
  return 0.6 * (1.0 - moonCells(uv * 7.0)) + 0.3 * (1.0 - moonCells(uv * 17.0 + 5.1)) + 0.1 * skyNoise(uv * 30.0);
}
vec3 drawMoon(vec3 sky, vec3 dir) {
  vec3 moonDir = normalize(uMoonDirection);
  float radius = uMoonSize * 0.5;
  float moonAngle = acos(clamp(dot(dir, moonDir), -1.0, 1.0));
  // Halo: a tight and a wide falloff around the disc.
  float halo = max(moonAngle - radius, 0.0);
  sky += uMoonColor * (exp(-halo * 12.0) * 0.22 + exp(-halo * 3.5) * 0.06) * uMoonEnabled;
  if (moonAngle > radius * 1.05 || uMoonEnabled < 0.5) return sky;

  vec3 right = normalize(cross(abs(moonDir.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0), moonDir));
  vec3 up = cross(moonDir, right);
  vec3 offsetDir = dir - moonDir * dot(dir, moonDir);
  vec2 disc = vec2(dot(offsetDir, right), dot(offsetDir, up)) / sin(radius);
  float discRadius = length(disc);
  vec3 ball = vec3(disc, sqrt(max(1.0 - discRadius * discRadius, 0.0)));
  vec3 normal = normalize(right * ball.x + up * ball.y - moonDir * ball.z);
  vec3 sun = normalize(uSunDirection);

  // Relief on longitude and latitude, so it bunches toward the edge like a ball's; its slope tilts the normal.
  vec2 surfaceUv = vec2(atan(ball.x, max(ball.z, 1e-3)), asin(clamp(ball.y, -1.0, 1.0)));
  float relief = moonRelief(surfaceUv);
  float delta = 0.01;
  vec2 slope = vec2(moonRelief(surfaceUv + vec2(delta, 0.0)) - relief, moonRelief(surfaceUv + vec2(0.0, delta)) - relief) / delta;
  vec3 bumped = normalize(normal - (right * slope.x + up * slope.y) * MOON_BUMP * 0.1);

  float light = uAmbient + MOON_LIGHT_LIFT + moonDiffuse(bumped, sun, uDiffuseWrap) * uLightIntensity * (1.0 - MOON_LIGHT_LIFT);
  vec3 surface = mix(uMoonColor * (0.85 + 0.25 * relief) * light, bottomColor, MOON_SKY_TINT);
  vec3 moon = mix(sky, surface, smoothstep(1.0, 0.98, discRadius) * MOON_OPACITY);

  // Rim: a thin bright line inside the edge, strongest on the side facing the sun.
  vec2 sunOnDisc = vec2(dot(sun, right), dot(sun, up));
  float sunSide = length(sunOnDisc) > 1e-4 ? 0.5 + 0.5 * dot(disc / max(discRadius, 1e-4), normalize(sunOnDisc)) : 0.5;
  float rim = smoothstep(0.9, 0.985, discRadius) * smoothstep(1.0, 0.985, discRadius);
  return moon + mix(uMoonColor, vec3(1.0), 0.5) * rim * mix(0.25, 1.0, sunSide) * MOON_RIM;
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
