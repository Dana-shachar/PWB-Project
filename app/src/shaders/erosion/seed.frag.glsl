// Pass 0: load a freshly baked patch into the simulation's state.
//
// The bake carries real elevation in G (map/heightmap.ts), which this
// converts into cell units so that a slope in the simulation is the slope
// actually on screen: the view's own vertical exaggeration rather than an
// arbitrary one. erosion/erosionEngine.ts divides it back out on readback.

uniform sampler2D uElevation;
uniform float uHeightToCells;
uniform float uSeaLevel; // already in cell units, converted by the engine
varying vec2 vUv;

void main() {
  float terrain = texture2D(uElevation, vUv).g * uHeightToCells;
  // Ground below the sea starts underwater, filled to the sea's own level.
  // This is why sea level belongs to erosion rather than to coloring: deep
  // slow water barely erodes, so coastlines gather sediment instead of
  // being cut away like a hillside.
  float water = max(0.0, uSeaLevel - terrain);
  // Sediment and the step's mean depth start at nothing.
  gl_FragColor = vec4(terrain, water, 0.0, 0.0);
}
