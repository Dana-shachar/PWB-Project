// The color grade, a post pass over the finished frame: Unity URP's steps and order (LutBuilderLdr.shader), split
// toning, then lift, gamma, gain, then saturation. The scene's shaders write screen (sRGB) color, so it decodes first.
uniform sampler2D tDiffuse;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSaturation;
uniform vec4 uSplitShadows; // rgb the shadows tint (gamma space, 0.5 is none), a the balance
uniform vec3 uSplitHighlights;
varying vec2 vUv;

const vec3 LUMA_WEIGHTS = vec3(0.2126729, 0.7151522, 0.0721750); // Unity's Luminance (Rec. 709)

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// Unity's Color.hlsl SoftLight.
vec3 softLight(vec3 base, vec3 blend) {
  vec3 r1 = 2.0 * base * blend + base * base * (1.0 - 2.0 * blend);
  vec3 r2 = sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend);
  vec3 t = step(0.5, blend);
  return r2 * t + (1.0 - t) * r1;
}

void main() {
  vec4 texel = texture2D(tDiffuse, vUv);
  vec3 color = max(srgbToLinear(texel.rgb), 0.0);

  // Split toning, in gamma space as Unity does (to match Adobe's).
  vec3 colorGamma = pow(color, vec3(1.0 / 2.2));
  float luma = clamp(dot(clamp(colorGamma, 0.0, 1.0), LUMA_WEIGHTS) + uSplitShadows.w, 0.0, 1.0);
  colorGamma = softLight(colorGamma, mix(vec3(0.5), uSplitShadows.rgb, 1.0 - luma));
  colorGamma = softLight(colorGamma, mix(vec3(0.5), uSplitHighlights, luma));
  color = pow(colorGamma, vec3(2.2));

  // Lift, gamma, gain (values prepared on the CPU as Unity's PrepareLiftGammaGain).
  color = color * uGain + uLift;
  color = sign(color) * pow(abs(color), uGamma);

  // Saturation around luminance.
  luma = dot(color, LUMA_WEIGHTS);
  color = luma + uSaturation * (color - luma);

  gl_FragColor = vec4(linearToSrgb(max(color, 0.0)), texel.a);
}
