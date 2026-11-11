// The life layers over the land chunk's ground (biome/plantTypes.ts), after a production moss shader (Berg, Neon Giant):
// cover = the grid's amount through a height blend on the moss's own cushion relief, times a top-down mask, plus an edge
// mask (an Unreal moss material function), with recessed hollows favored (Unity Terrain Tools' Concavity filter). Sources
// in REFERENCES.md. Positions are camera-relative (Unity HDRP, Unreal large world coordinates), so cushions stay exact.
const float LIFE_BLEND_POWER = 15.0; // Berg's BlendPower
const float LIFE_TOP_MULTIPLIER = 3.0; // Berg's TopdownMaskMultiplier
const float LIFE_TOP_POWER = 5.0; // Berg's TopdownMaskPower
const float LIFE_GROUND_SHARE = 0.35;

// Cordonnier's hat function, the grid's own (lifeStep.frag.glsl): -1 outside survival, 1 in the ideal range.
float lifeHat(float c, vec4 range) {
  if (c < range.x || c > range.w) return -1.0;
  if (c < range.y) return (c - range.x) / max(range.y - range.x, 1e-4);
  if (c > range.z) return (range.w - c) / max(range.w - range.z, 1e-4);
  return 1.0;
}

// How well a type can live at this pixel, 0 to 1: the grid's viability (the worst input wins, Liebig's law) on this
// pixel's own temperature, moisture and sunlight, so life fills the best spots first.
float lifeSuitability(vec3 inputs, vec4 temperature, vec4 moisture, vec4 sun) {
  return min(lifeHat(inputs.x, temperature), min(lifeHat(inputs.y, moisture), lifeHat(inputs.z, sun))) * 0.5 + 0.5;
}

// The life grid read with a cubic B-spline, so its cells curve smoothly instead of showing as squares: four bilinear reads
// (Sigg and Hadwiger, "Fast Third-Order Texture Filtering", GPU Gems 2, ch. 20).
vec4 lifeSampleSmooth(sampler2D grid, vec2 uv, float gridSize) {
  vec2 coord = uv * gridSize - 0.5;
  vec2 f = fract(coord);
  vec2 index = coord - f;
  vec2 w0 = (1.0 / 6.0) * (1.0 - f) * (1.0 - f) * (1.0 - f);
  vec2 w1 = (1.0 / 6.0) * (3.0 * f * f * f - 6.0 * f * f + 4.0);
  vec2 w2 = (1.0 / 6.0) * (-3.0 * f * f * f + 3.0 * f * f + 3.0 * f + 1.0);
  vec2 w3 = (1.0 / 6.0) * f * f * f;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = (index + w1 / g0 - 1.0 + 0.5) / gridSize;
  vec2 h1 = (index + w3 / g1 + 1.0 + 0.5) / gridSize;
  return g0.y * (g0.x * texture2D(grid, h0) + g1.x * texture2D(grid, vec2(h1.x, h0.y)))
       + g1.y * (g0.x * texture2D(grid, vec2(h0.x, h1.y)) + g1.x * texture2D(grid, h1));
}

// HSL to RGB, the standard formula.
vec3 hslToRgb(vec3 hsl) {
  vec3 rgb = clamp(abs(mod(hsl.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return hsl.z + hsl.y * (rgb - 0.5) * (1.0 - abs(2.0 * hsl.z - 1.0));
}

// One life type's layer: its cover, and its color. Placement from the terrain alone (suitability as Berg's height); no
// texture of its own, since the ground's own texture shows through the tint (chunk.frag.glsl). hue: center (degrees),
// unused, saturation min, max. shade: lightness min, max. mask: unused, edge amount, edge thickness, unused.
float lifeLayer(float amount, float up, float groundDetail, float suitability, vec4 hue, vec4 shade, vec4 mask, out vec3 color) {
  // The height blend's height mixes in the ground's own texture (Mishkinis; Berg), so the edge breaks along the terrain's
  // existing pattern instead of a smooth curve. Share inferred, TUNABLE.
  float height = mix(suitability, groundDetail, LIFE_GROUND_SHARE);
  float a = clamp(amount, 0.0, 1.0);
  // Berg's height blend and top-down mask, the edge mask; each edge never sharper than a pixel (aastep, Gustavson 2012).
  float blendValue = height * a + a;
  float amountMask = clamp(pow(blendValue, min(LIFE_BLEND_POWER, 0.7 / max(fwidth(blendValue), 1e-4))), 0.0, 1.0);
  float topValue = max(up, 0.0) * LIFE_TOP_MULTIPLIER + height;
  float topMask = clamp(pow(topValue, min(LIFE_TOP_POWER, 0.7 / max(fwidth(topValue), 1e-4))), 0.0, 1.0);
  float edgeMask = pow(1.0 - clamp(up, 0.0, 1.0), mask.z) * mask.y * height * a;
  float cover = clamp(amountMask * topMask + edgeMask, 0.0, 1.0);

  vec3 srgb = hslToRgb(vec3(fract(hue.x / 360.0), (hue.z + hue.w) * 0.5, (shade.x + shade.y) * 0.5));
  color = mix(srgb / 12.92, pow((srgb + 0.055) / 1.055, vec3(2.4)), step(0.04045, srgb)); // to linear, as the land ramp is
  return cover;
}

// The ground tinted toward a life color (Shane's moss: a multiplicative tint, so the ground shows through): the life's
// hue and saturation, the ground's own lightness scaled by brightness, so ramp, rock and shading all stay visible.
vec3 lifeTint(vec3 ground, vec3 life, float brightness) {
  vec3 groundHsv = rgbToHsv(max(ground, 0.0));
  vec3 lifeHsv = rgbToHsv(max(life, 0.0));
  // The ground's saturation shifted toward the life's, not replaced, so its variation survives. Share inferred, TUNABLE.
  return hsvToRgb(vec3(lifeHsv.x, mix(groundHsv.y, lifeHsv.y, 0.7), groundHsv.z * brightness));
}
