// The planet's glow, like Photoshop's outer glow: brightest at the planet's edge and fading smoothly outward with how
// far the view ray passes from the planet (and quickly inward over the disc). A sharp and a soft falloff are stacked,
// and the sum is soft-clipped so it never bands to white. Idea from jsulpis's "Procedural Blue Planet" atmosphere
// (distance from the edge, stacked falloffs, tone mapping), rewritten. Mix and inward rate inferred, TUNABLE.
uniform vec3 glowColor;
uniform vec3 uCenter;
uniform float uRadius;
uniform float uWidth; // the glow's size, in world units
uniform float uStrength;
uniform vec3 uCameraPosition;
varying vec3 vWorldPosition;
void main() {
  vec3 rayDirection = normalize(vWorldPosition - uCameraPosition);
  vec3 toCenter = uCenter - uCameraPosition;
  float along = dot(toCenter, rayDirection);
  // Closest the ray passes to the center; past the edge in glow widths (negative over the planet's disc).
  float closest = along > 0.0 ? length(toCenter - rayDirection * along) : length(toCenter);
  float beyond = (closest - uRadius) / max(uWidth, 1e-6);
  float glow = beyond >= 0.0
    ? 0.6 * exp(-beyond * 2.5) + 0.4 * exp(-beyond * 0.8)
    : exp(beyond * 3.0);
  vec3 color = glowColor * glow * uStrength;
  gl_FragColor = vec4(1.0 - exp(-color), 1.0);
}
