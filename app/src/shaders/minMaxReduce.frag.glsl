// One level of a min/max reduction pyramid (Tevs, Ihrke & Seidel 2008,
// "Maximum Mipmaps" — see REFERENCES.md): unlike an averaging mipmap, each
// output texel holds the true min and max of the 2x2 source block under it,
// not a blurred average, so repeating this pass down to a single texel
// gives that texel the source's exact min/max, nothing approximated away.
// See map/heightmap.ts's getRegionMinMaxAsync() and ISSUES.md, [B32].

uniform sampler2D uSource;
uniform vec2 uTexelSize; // 1 / source width, 1 / source height
// First pass reads the real elevation bake (G channel, see heightmap.frag.glsl's
// own convention) and seeds both min and max from it. Every later pass reads
// the previous level's own running min (R) and max (G) instead — this
// texture's layout is this pass's output, not the elevation bake's.
uniform float uFirstPass;

varying vec2 vUv;

void main() {
  vec2 half_ = uTexelSize * 0.5;
  // Clamped to valid texel centers so the last row/column of an odd-sized
  // source is never sampled past its own edge.
  vec2 lo = clamp(vUv - half_, half_, 1.0 - half_);
  vec2 hi = clamp(vUv + half_, half_, 1.0 - half_);

  vec4 a = texture2D(uSource, vec2(lo.x, lo.y));
  vec4 b = texture2D(uSource, vec2(hi.x, lo.y));
  vec4 c = texture2D(uSource, vec2(lo.x, hi.y));
  vec4 d = texture2D(uSource, vec2(hi.x, hi.y));

  float aMin = uFirstPass > 0.5 ? a.g : a.r;
  float bMin = uFirstPass > 0.5 ? b.g : b.r;
  float cMin = uFirstPass > 0.5 ? c.g : c.r;
  float dMin = uFirstPass > 0.5 ? d.g : d.r;

  float minVal = min(min(aMin, bMin), min(cMin, dMin));
  float maxVal = max(max(a.g, b.g), max(c.g, d.g));
  gl_FragColor = vec4(minVal, maxVal, 0.0, 1.0);
}
