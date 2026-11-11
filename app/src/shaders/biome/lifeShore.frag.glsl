// Distance to the nearest water on the life grid, by jump flooding (Rong and Tan 2006, "Jump Flooding in GPU with
// Applications to Voronoi Diagram and Distance Transform"): each cell keeps the nearest water cell found so far, checking
// 8 neighbors at a step that halves each pass (256, 128, ... 1). Baked once per input change (biome/lifeGrid.ts).
uniform sampler2D uSource; // mode 0: the inputs (A 1.5 under water); modes 1 and 2: the nearest-water map
uniform float uMode; // 0 seed water cells, 1 one jump pass, 2 the distance (R, in grid UV)
uniform float uStep; // mode 1: neighbor offset in cells
uniform float uGridSize;
varying vec2 vUv;

void main() {
  if (uMode < 0.5) {
    // A water cell is its own nearest water; any other cell has none yet (-1).
    gl_FragColor = texture2D(uSource, vUv).a > 1.25 ? vec4(vUv, 0.0, 1.0) : vec4(-1.0);
    return;
  }
  if (uMode > 1.5) {
    vec2 nearest = texture2D(uSource, vUv).xy;
    gl_FragColor = vec4(nearest.x < 0.0 ? 10.0 : length(nearest - vUv), 0.0, 0.0, 1.0);
    return;
  }
  vec2 best = vec2(-1.0);
  float bestDistance = 1.0e9;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 seed = texture2D(uSource, vUv + vec2(float(x), float(y)) * uStep / uGridSize).xy;
      if (seed.x < 0.0) continue;
      float distance = length(seed - vUv);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = seed;
      }
    }
  }
  gl_FragColor = vec4(best, 0.0, 1.0);
}
