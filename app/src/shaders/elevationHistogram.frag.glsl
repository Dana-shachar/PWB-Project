// Every point contributes exactly 1 to its own bin — the actual counting
// happens via GL_ONE/GL_ONE additive blending (map/heightmap.ts), not here.
// See elevationHistogram.vert.glsl for the bin math.
varying float vWeight; // 1, or the sample's area share for the whole globe

void main() {
  gl_FragColor = vec4(vWeight, 0.0, 0.0, 1.0);
}
