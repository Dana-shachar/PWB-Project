// The chunk's sky: three.js's hemisphere-lights sky dome (MIT): mix(bottomColor, topColor, pow(max(h, 0), exponent))
// with h = normalize(position + offset).y, here around the camera (uCenter) and scaled to the dome's radius.
// Additions for this project, inferred and TUNABLE: a soft sun halo, an optional textured moon, and soft flat clouds
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
// Up to five moons, in draw order (smallest first); each surface is a globe-style height map (R).
const int MAX_MOON_SLOTS = 5;
uniform float uMoonCount;
uniform vec3 uMoonDirections[MAX_MOON_SLOTS];
uniform float uMoonSizes[MAX_MOON_SLOTS]; // radians across
uniform vec3 uMoonColors[MAX_MOON_SLOTS];
uniform vec3 uMoonColors2[MAX_MOON_SLOTS];
uniform float uMoonHasTexture[MAX_MOON_SLOTS];
uniform float uMoonCrescentAngles[MAX_MOON_SLOTS]; // radians the crescent turns from the sun's side
uniform sampler2D uMoonTexture0;
uniform sampler2D uMoonTexture1;
uniform sampler2D uMoonTexture2;
uniform sampler2D uMoonTexture3;
uniform sampler2D uMoonTexture4;
uniform float uMoonTextureAmount; // 0 to 2: the texture's contrast for both tones, and up to 1 the solid layer
uniform float uMoonHalo;
uniform float uMoonGlow;
uniform float uMoonCrescent; // 0 full moon, 1 thinnest crescent
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

// The moon, after Dana's No Man's Sky references (REFERENCES.md, docs/references/nms-*.png). It only adds light to the
// sky (a screen blend), so its dark side is the sky itself; the surface is nearly flat, its pattern a brightness tone
// over a diagonal two-color overlay; the light swings behind it by Crescent, so the lit part is a curved crescent with
// a soft, height-roughened terminator (after sturm_trouper's moon, CC0); a halo and an inner edge glow, also screened.
// Screen blend: W3C Compositing and Blending Level 1. Strengths inferred, TUNABLE.
const float MOON_BUMP = 1.0;                  // soft relief, readable as a surface
const float MOON_PATTERN = 1.0;               // how strongly the texture's contrast drives the split toning
const float MOON_BRIGHTNESS = 0.85;           // the glow screened over the sky at Texture 0 (a translucent moon)
const float MOON_SOLID_GLOW = 0.15;           // the glow that remains at Texture 1 and above: luminous, never bleaching
const float MOON_SKY_TINT = 0.2;              // how much the solid surface is washed toward the sky
const float MOON_TERMINATOR_SOFTNESS = 0.5;   // how wide the lit side melts into the sky
const float MOON_TERMINATOR_ROUGHNESS = 0.15; // how much the surface breaks up that edge
const float MOON_MAX_PHASE = 2.9;             // radians the light swings behind the moon at Crescent 100
const float MOON_DARK_DEPTH = 0.55;           // how deep the darks go under their Second color tint
// The glow around and inside the edge, sized like the planet's glow (planetGlow.frag.glsl): outward, a minimum share of
// the moon's radius plus a part that grows with Halo, never under MOON_HALO_MIN_ANGLE so far, small moons still get
// distance and feather; inward, a share that grows with Inner glow. Tone mapped, lit side only.
const float MOON_HALO_MIN_SHARE = 0.17;
const float MOON_HALO_SHARE_PER_UNIT = 0.33;
const float MOON_HALO_MIN_ANGLE = 0.03; // radians, about 1.7 degrees
const float MOON_HALO_STRENGTH = 0.6;
const float MOON_GLOW_MIN_SHARE = 0.04;
const float MOON_GLOW_SHARE_PER_UNIT = 0.12;
const float MOON_GLOW_STRENGTH = 0.8;
vec3 blendScreen(vec3 backdrop, vec3 source) {
  return backdrop + source - backdrop * source;
}
float moonDiffuse(vec3 normal, vec3 lightDir, float wrap) {
  float wrapped = clamp((dot(normal, lightDir) + wrap) / (1.0 + wrap), 0.0, 1.0);
  return pow(wrapped, 1.0 + wrap);
}
// The surface height at a point of the unit ball (z toward the viewer), read from the globe-style map with its seam
// turned to the back. Flat until the first bake.
float moonSurface(int slot, vec3 ball) {
  if (uMoonHasTexture[slot] < 0.5) return 0.5;
  vec3 sphere = normalize(vec3(ball.z, ball.y, ball.x));
  vec2 uv = vec2(atan(sphere.z, sphere.x) / 6.28318531 + 0.5, asin(clamp(sphere.y, -1.0, 1.0)) / 3.14159265 + 0.5);
  if (slot == 0) return texture2D(uMoonTexture0, uv).r;
  if (slot == 1) return texture2D(uMoonTexture1, uv).r;
  if (slot == 2) return texture2D(uMoonTexture2, uv).r;
  if (slot == 3) return texture2D(uMoonTexture3, uv).r;
  return texture2D(uMoonTexture4, uv).r;
}
vec3 drawMoon(vec3 sky, vec3 dir, int slot) {
  vec3 moonDir = normalize(uMoonDirections[slot]);
  float radius = uMoonSizes[slot] * 0.5;
  float moonAngle = acos(clamp(dot(dir, moonDir), -1.0, 1.0));
  vec3 right = normalize(cross(abs(moonDir.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0), moonDir));
  vec3 up = cross(moonDir, right);
  vec3 offsetDir = dir - moonDir * dot(dir, moonDir);
  vec2 disc = vec2(dot(offsetDir, right), dot(offsetDir, up)) / sin(radius);
  float discRadius = length(disc);
  // The light comes from the sun's side of the disc, swung behind the moon by Crescent (0 full, 1 thinnest).
  vec3 sun = normalize(uSunDirection);
  vec2 sunOnDisc = vec2(dot(sun, right), dot(sun, up));
  vec2 side = length(sunOnDisc) > 1e-3 ? normalize(sunOnDisc) : vec2(1.0, 0.0);
  // Each moon's Crescent angle turns its lit side round from the sun's.
  float turn = uMoonCrescentAngles[slot];
  side = vec2(side.x * cos(turn) - side.y * sin(turn), side.x * sin(turn) + side.y * cos(turn));

  // One glow across the edge (Dana: no stripe where halo and inner glow meet): a rounded peak at the edge, spreading
  // outward by Halo's distance and inward by Inner glow's, on the lit side only so nothing outlines the dark half.
  float offAngle = moonAngle - radius;
  float haloWidth = max(radius * (MOON_HALO_MIN_SHARE + uMoonHalo * MOON_HALO_SHARE_PER_UNIT), MOON_HALO_MIN_ANGLE);
  float glowWidth = radius * (MOON_GLOW_MIN_SHARE + uMoonGlow * MOON_GLOW_SHARE_PER_UNIT);
  float across = offAngle / (offAngle > 0.0 ? haloWidth : max(glowWidth, 1e-5));
  float rounded = 1.0 / (1.0 + across * across); // flat at the edge itself, so no line forms there
  float strength = mix(uMoonGlow * MOON_GLOW_STRENGTH, uMoonHalo * MOON_HALO_STRENGTH, smoothstep(-0.5, 0.5, across));
  float litSide = mix(1.0, smoothstep(-0.1, 0.6, dot(disc / max(discRadius, 1e-4), side)), smoothstep(0.0, 0.15, uMoonCrescent));
  vec3 glow = mix(uMoonColors[slot], vec3(1.0), 0.3) * (1.0 - exp(-rounded * litSide * strength));
  if (offAngle > 0.0) return blendScreen(sky, glow);

  vec3 ball = vec3(disc, sqrt(max(1.0 - discRadius * discRadius, 0.0)));
  vec3 normal = normalize(right * ball.x + up * ball.y - moonDir * ball.z);
  float phase = uMoonCrescent * MOON_MAX_PHASE;
  vec3 light = normalize((right * side.x + up * side.y) * sin(phase) - moonDir * cos(phase));

  float height = moonSurface(slot, ball);
  float delta = 0.01;
  float slopeX = (moonSurface(slot, normalize(ball + vec3(delta, 0.0, 0.0))) - height) / delta;
  float slopeY = (moonSurface(slot, normalize(ball + vec3(0.0, delta, 0.0))) - height) / delta;
  vec3 bumped = normalize(normal - (right * slopeX + up * slopeY) * MOON_BUMP * 0.1);

  float facing = dot(normal, light) + (height - 0.5) * MOON_TERMINATOR_ROUGHNESS;
  // The fade narrows as the light goes behind the moon, so a thin crescent's whole edge doesn't stay half lit.
  float lit = smoothstep(-max(MOON_TERMINATOR_SOFTNESS * sin(phase), 0.02), 0.0, facing);

  float shade = mix(0.8, 1.0, moonDiffuse(bumped, light, uDiffuseWrap));
  // Split toning (Lightroom's Split Toning / Color Grading): the surface's brightness, from its texture and shading, is
  // tinted twice. Multiply tints the darks with Second color, screen tints the brights with Color. Texture scales the
  // texture's contrast for both together (0 flat, 2 strongest); the shadow (Crescent) then dissolves both alike.
  float tone = clamp(0.5 + (height - 0.5) * MOON_PATTERN * 2.0 * min(uMoonTextureAmount, 2.0), 0.0, 1.0) * shade;
  vec3 darks = uMoonColors2[slot] * mix(MOON_DARK_DEPTH, 1.0, tone);
  vec3 surface = blendScreen(darks, uMoonColors[slot] * tone);
  float edge = smoothstep(1.0, 0.99, discRadius);
  // Layered like an image editor's stack: the textured surface as a normal layer at Texture's opacity (lit side only),
  // then the light screened over it, so the pattern shows while the moon still melts into the sky.
  float solid = min(uMoonTextureAmount, 1.0);
  // The dark side is the sky itself (Dana): only the lit part is drawn.
  vec3 layered = mix(sky, mix(surface, sky, MOON_SKY_TINT), solid * lit * edge);
  vec3 moonLight = surface * lit * mix(MOON_BRIGHTNESS, MOON_SOLID_GLOW, solid);
  return blendScreen(blendScreen(layered, moonLight * edge), glow);
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

  if (uMoonEnabled > 0.5) {
    for (int i = 0; i < MAX_MOON_SLOTS; i++) {
      if (float(i) >= uMoonCount) break;
      sky = drawMoon(sky, dir, i);
    }
  }

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
