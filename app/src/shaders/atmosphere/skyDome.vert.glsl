// The chunk's sky dome: three.js's hemisphere-lights example (MIT), drawn at the far plane.
varying vec3 vWorldPosition;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Depth exactly at the far plane (LearnOpenGL, "Cubemaps"): with walk mode's tiny near plane, rounding clipped
  // facets of the dome and left black holes in the sky (measured, 2026-11-04).
#ifdef USE_REVERSED_DEPTH_BUFFER
  gl_Position = vec4(clip.xy, 0.0, clip.w); // reversed depth puts the far plane at 0 (three.js defines this, [B171])
#else
  gl_Position = clip.xyww;
#endif
}
