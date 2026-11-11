// The land's color and light layers, shared by the planet patches and the chunk (joined as text, like terrain.glsl).

// The sky fill: one light straight down, so faces turned up to the sky get the most (Quilez, outdoor lighting:
// sky = clamp(0.5 + 0.5 * nor.y); three.js's hemisphere light with a black ground). Tinted, so shadows take a color.
vec3 fillLight(vec3 normal, vec3 up, vec3 fillColor, float ambient) {
  return fillColor * ambient * clamp(0.5 + 0.5 * dot(normal, up), 0.0, 1.0);
}

// Unity Toon Shader's shade mask (UniversalToonBodyDoubleShadeWithFeather.hlsl): 0 lit above step, 1 shade below
// step - feather, a linear blend between. light is half-Lambert, times the cast shadow.
float toonShadeMask(float light, float step, float feather) {
  feather = max(feather, 1e-4);
  return clamp(1.0 - (light - (step - feather)) / feather, 0.0, 1.0);
}

// Unity's Color.hlsl RgbToHsv and HsvToRgb.
vec3 rgbToHsv(vec3 c) {
  const vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  const float e = 1.0e-4;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsvToRgb(vec3 c) {
  const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// The shade's own color from the ground's: its hue turned by the shadow hue (a color-rule turn), chroma scaled, value at
// lift; the painters' hue-shifted shadow that loses chroma. hueTurn is a share of the wheel. Amounts TUNABLE.
vec3 shadeColor(vec3 surfaceColor, float hueTurn, float lift, float chroma) {
  vec3 hsv = rgbToHsv(max(surfaceColor, 0.0));
  return hsvToRgb(vec3(fract(hsv.x + hueTurn), clamp(hsv.y * chroma, 0.0, 1.0), hsv.z * lift));
}

// Rock on steep ground, the standard slope-based terrain texturing: steepness 1 - dot(normal, up) (0 flat, 1 a wall) past
// Slope, eased over Softness, takes the rock ramp's color at this height (rockColor) instead of the land ramp's.
vec3 landSurfaceColor(vec3 rampColor, vec3 rockColor, vec3 normal, vec3 up, float slopeStart, float softness) {
  float steepness = 1.0 - clamp(dot(normalize(normal), normalize(up)), 0.0, 1.0);
  float rock = smoothstep(slopeStart, slopeStart + max(softness, 1e-3), steepness);
  return mix(rampColor, rockColor, rock);
}

