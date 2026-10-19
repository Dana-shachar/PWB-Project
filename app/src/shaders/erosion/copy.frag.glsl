// A plain copy: writes uSource unchanged. The only way to get a checkpoint's
// saved CPU data back into a GPU render target — WebGL has no direct "upload
// pixels into a render target" call, only "render something into it" — so
// loading a checkpoint uploads the saved buffer as a texture, then runs this
// pass to copy it in, the same full-screen-quad mechanism every other pass
// here uses. See erosionEngine.ts's loadCheckpoint().
uniform sampler2D uSource;
varying vec2 vUv;

void main() {
  gl_FragColor = texture2D(uSource, vUv);
}
