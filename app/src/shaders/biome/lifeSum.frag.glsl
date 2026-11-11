// A GPU reduction (GPU Gems 2, ch. 31): each output pixel sums a block of the life grid, so an era reads back a small
// grid of totals instead of the whole one (biome/lifeGrid.ts). Left half algae, right half moss, so one read serves both.
uniform sampler2D uAlgae;
uniform sampler2D uMoss;
uniform float uSourceSize; // pixels per side of the source
uniform float uBlock; // source pixels per side summed into one output pixel
varying vec2 vUv;

void main() {
  vec2 uv = vec2(fract(vUv.x * 2.0), vUv.y);
  vec2 start = floor(uv * uSourceSize / uBlock) * uBlock;
  vec4 sum = vec4(0.0);
  for (int y = 0; y < 16; y++) {
    for (int x = 0; x < 16; x++) {
      vec2 sampleUv = (start + vec2(float(x), float(y)) + 0.5) / uSourceSize;
      sum += vUv.x < 0.5 ? texture2D(uAlgae, sampleUv) : texture2D(uMoss, sampleUv);
    }
  }
  gl_FragColor = sum;
}
