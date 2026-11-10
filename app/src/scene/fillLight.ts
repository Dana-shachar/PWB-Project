import * as THREE from 'three';

// The sky fill's color (shaders/terrain/landLayers.glsl): the sky's top color turned by Shadow hue (degrees), scaled
// to the luminance of white, so it tints without dimming and Ambient light keeps setting the strength. White with no sky.
export function fillColorFor(skyEnabled: boolean, zenithColor: string, shadowHue: number): THREE.Color {
  if (!skyEnabled) return new THREE.Color(1, 1, 1);
  const color = new THREE.Color(zenithColor).offsetHSL(shadowHue / 360, 0, 0);
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b; // Rec. 709, linear
  return luminance > 0 ? color.multiplyScalar(1 / luminance) : new THREE.Color(1, 1, 1);
}


const HUE_TRACK_STEP = 30; // degrees between the track's gradient stops

// The Shadow hue track: the fill color at each hue turn from -180 to 180, so the track's center is the sky's own hue.
// A preview of the shade for a ground color (landLayers.glsl's shadeColor works in HSV, this in HSL, close enough for a swatch).
export function shadeColorFor(groundColor: string, shadowHue: number, chroma: number, lift: number): THREE.Color {
  const hsv = new THREE.Color(groundColor).getHSL({ h: 0, s: 0, l: 0 });
  return new THREE.Color().setHSL((((hsv.h + shadowHue / 360) % 1) + 1) % 1, Math.min(hsv.s * chroma, 1), hsv.l * lift);
}

// The Shadow hue track: the shade of the given ground color at every turn.
export function shadeHueTrackGradient(groundColor: string, chroma: number): string {
  const stops: string[] = [];
  for (let hue = -180; hue <= 180; hue += HUE_TRACK_STEP) stops.push(shadeColorFor(groundColor, hue, chroma, 1).getStyle());
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

