import * as THREE from 'three';

// One stop of the elevation color ramp. All stops are equal: any can be
// dragged, typed into or deleted (Dana, 2026-10-21: the base color is only
// special as the flat color used when Color by elevation is off). Past the
// lowest/highest stop the ramp holds that stop's color. Generalizes the old
// fixed Mid/High pair into the Blender Color Ramp/Figma gradient-editor
// convention (ROADMAP.md, Stage 07.4).
export interface ColorStop {
  position: number; // 0..1
  color: string; // hex
}

// GLSL ES 1.00 (what every shader here is written in, even under a WebGL2
// context) has no dynamic-length arrays, so the ramp uniform is a fixed-
// size array plus a live count rather than a variable-length one. 8 is
// generous against anything Blender/Figma's own ramps typically need and
// cheap either way (a handful of extra vec3 uniforms).
export const MAX_COLOR_STOPS = 8;

// Starts at 0 with the default base color, then the old fixed Mid (#6b8f4e)
// / High (#ffffff) — an old save migrates to this same visual result, see
// planetControls.ts's applySettings().
export const DEFAULT_COLOR_STOPS: ColorStop[] = [
  { position: 0, color: '#c9dbea' },
  { position: 0.5, color: '#6b8f4e' },
  { position: 1.0, color: '#ffffff' },
];

// Assembles the shader's uRampColors/uRampPositions/uRampCount from the
// user's stops — the one place this happens, reused by every wiring site
// (SceneCanvas.tsx, LandChunkCanvas.tsx, planetPatchMesh.ts) instead of
// three copies of the same sort-and-pad logic. Stops are sorted by position
// first, since the ramp shader assumes ascending order and dragging a stop
// past a neighbor shouldn't require the caller to re-sort itself.
export function buildRampUniformArrays(stops: ColorStop[]): { colors: THREE.Color[]; positions: number[]; count: number } {
  const sorted = [...stops].sort((a, b) => a.position - b.position).slice(0, MAX_COLOR_STOPS);
  const count = sorted.length;

  const colors = sorted.map((stop) => new THREE.Color(stop.color));
  const positions = sorted.map((stop) => stop.position);
  // Padded to the full fixed array length — unused slots past `count` are
  // never read by the shader, but Three.js still needs a value of the
  // right length for the uniform upload.
  while (colors.length < MAX_COLOR_STOPS) {
    colors.push(colors[colors.length - 1].clone());
    positions.push(positions[positions.length - 1]);
  }
  return { colors, positions, count };
}
