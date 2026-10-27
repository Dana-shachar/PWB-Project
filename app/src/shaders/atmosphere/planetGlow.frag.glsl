// The glow's color, added on top of the scene (additive blending).
uniform vec3 glowColor;
uniform float uStrength;
varying float intensity;
void main() {
  gl_FragColor = vec4(glowColor * intensity * uStrength, 1.0);
}
