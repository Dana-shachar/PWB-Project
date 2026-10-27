// One point per sample, scattered into a 256-bin, 1px-tall histogram target
// (map/heightmap.ts's getRegionPercentileRangeAsync) — each point reads its
// own elevation from the source bake (vertex texture fetch, same technique
// the planet's own vertex.glsl already relies on) and lands in the column
// for the bin that value falls into. Real production auto-exposure systems
// build a luminance histogram the same way (rasterize-to-bin + additive
// blending) to avoid one outlier pixel skewing the result — see
// REFERENCES.md, "GPU histogram". The fragment shader just outputs a
// constant 1.0; accumulation happens via GL_ONE/GL_ONE additive blending,
// not in-shader math.
attribute vec2 aSampleUV; // this point's fixed sample position, 0..1 over the source texture

uniform sampler2D uSource;
uniform float uRangeMin; // the region's own literal min (getRegionMinMaxAsync) — bins bucket within these bounds
uniform float uRangeMax;
uniform float uBinCount;
// 1 for the whole-globe bake (latitude by longitude): each sample counts by cos(latitude), its share of the sphere.
uniform float uAreaWeighted;
varying float vWeight;

void main() {
  float elevationRaw = texture2D(uSource, aSampleUV).g; // G: real elevation, same convention as every other heightmap read in this project
  float range = max(1e-6, uRangeMax - uRangeMin);
  float t = clamp((elevationRaw - uRangeMin) / range, 0.0, 1.0);
  // Same clamp-at-top convention as elevationRange.ts's own CPU bin walk —
  // the literal max must land in the last bin, not one past it.
  float bin = min(uBinCount - 1.0, floor(t * uBinCount));
  float ndcX = -1.0 + (bin + 0.5) * (2.0 / uBinCount); // bin's own column center, so a 1px point lands cleanly inside it
  gl_Position = vec4(ndcX, 0.0, 0.0, 1.0);
  gl_PointSize = 1.0;
  vWeight = uAreaWeighted > 0.5 ? cos((aSampleUV.y - 0.5) * 3.14159265) : 1.0;
}
