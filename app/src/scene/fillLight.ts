import * as THREE from 'three';

// The sky fill's color (shaders/terrain/landLayers.glsl): the sky's top color turned by Shadow hue (degrees), scaled
// to the luminance of white, so it tints without dimming and Ambient light keeps setting the strength. White with no sky.
export function fillColorFor(skyEnabled: boolean, zenithColor: string, shadowHue: number): THREE.Color {
  if (!skyEnabled) return new THREE.Color(1, 1, 1);
  const color = new THREE.Color(zenithColor).offsetHSL(shadowHue / 360, 0, 0);
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b; // Rec. 709, linear
  return luminance > 0 ? color.multiplyScalar(1 / luminance) : new THREE.Color(1, 1, 1);
}
