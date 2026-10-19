// Every point contributes exactly 1 to its own bin — the actual counting
// happens via GL_ONE/GL_ONE additive blending (map/heightmap.ts), not here.
// See elevationHistogram.vert.glsl for the bin math.
void main() {
  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
}
