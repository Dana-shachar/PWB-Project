// The haze over the planet's surface: the horizon color laid over the ground, thickest toward the edges where the eye
// looks through the most air, and lit by the sun (softly wrapped, dim on the night side). Light amounts inferred.
uniform vec3 hazeColor;
uniform float uStrength;
uniform vec3 uLightDirection;
uniform float uAmbient;
varying float intensity;
varying vec3 vWorldNormal;
void main() {
  float sunlit = clamp((dot(normalize(vWorldNormal), normalize(uLightDirection)) + 0.5) / 1.5, 0.0, 1.0);
  gl_FragColor = vec4(hazeColor * (uAmbient + sunlit), clamp(intensity * uStrength, 0.0, 1.0));
}
