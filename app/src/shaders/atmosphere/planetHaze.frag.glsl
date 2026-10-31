// The haze in the sky around the planet: drawn on the shell's far side with the depth test on, so it shows only where
// no surface is in front; the surfaces haze themselves (planetAir.glsl, called from planetPatch.frag.glsl).
uniform vec3 uCameraPosition;
uniform vec3 uLightDirection;
uniform float uAmbient;
varying vec3 vWorldPosition;

void main() {
  gl_FragColor = planetHaze(uCameraPosition, normalize(vWorldPosition - uCameraPosition), 1e20, uLightDirection, uAmbient);
}
