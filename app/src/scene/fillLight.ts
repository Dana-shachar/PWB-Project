import * as THREE from 'three';

// The sky fill's color (shaders/terrain/landLayers.glsl): the sky's top color turned by Shadow hue (degrees), scaled
// to the luminance of white, so it tints without dimming and Ambient light keeps setting the strength. White with no sky.
export function fillColorFor(skyEnabled: boolean, zenithColor: string, shadowHue: number): THREE.Color {
  if (!skyEnabled) return new THREE.Color(1, 1, 1);
  const color = new THREE.Color(zenithColor).offsetHSL(shadowHue / 360, 0, 0);
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b; // Rec. 709, linear
  return luminance > 0 ? color.multiplyScalar(1 / luminance) : new THREE.Color(1, 1, 1);
}

// A fill color the screen can show: scaled down by its largest channel when above 1, keeping its hue (the Shadow hue swatch).
export function displayColorFor(color: THREE.Color): THREE.Color {
  const largest = Math.max(color.r, color.g, color.b);
  return largest > 1 ? color.clone().multiplyScalar(1 / largest) : color.clone();
}

const HUE_TRACK_STEP = 30; // degrees between the track's gradient stops

// The Shadow hue track: the fill color at each hue turn from -180 to 180, so the track's center is the sky's own hue.
export function hueTrackGradient(zenithColor: string): string {
  const stops: string[] = [];
  for (let hue = -180; hue <= 180; hue += HUE_TRACK_STEP) {
    stops.push(displayColorFor(fillColorFor(true, zenithColor, hue)).getStyle());
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
