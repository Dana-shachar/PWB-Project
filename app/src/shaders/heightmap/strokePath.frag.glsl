// Computes each pixel's minimum distance to the current stroke's whole path
// (the chain of points dragged through so far), not a union of separate
// per-dab circles — a true continuous "capsule chain" shape with one smooth
// falloff. Combining discrete circles via MAX (an earlier attempt) leaves a
// crease in the falloff's slope wherever two dabs are equidistant — invisible
// in flat 2D color, but visible as jagged ridges once it drives 3D
// displacement. See ISSUES.md, 2026-09-22.

varying vec2 vUv;

const int MAX_STROKE_POINTS = 64; // TODO(DS): arbitrary cap — a longer single unbroken drag just stops extending past this many points

uniform sampler2D uLayerBase; // (value, mask) — the layer's state before this stroke began
uniform vec2 uPoints[MAX_STROKE_POINTS];
uniform int uPointCount;
uniform float uRadius;
uniform float uFeather;
uniform float uTargetValue;

// Distance from p to segment (a,b), wrap-aware in U — the sphere's seam
// means 0.0 and 1.0 are the same longitude, so a naive segment could
// incorrectly span the whole texture width when it crosses that seam.
float distanceToSegment(vec2 p, vec2 a, vec2 b) {
  float duB = b.x - a.x;
  duB -= floor(duB + 0.5); // wrap to the shortest way around, [-0.5, 0.5]
  float duP = p.x - a.x;
  duP -= floor(duP + 0.5);
  vec2 aLocal = vec2(0.0, a.y);
  vec2 bLocal = vec2(duB, b.y);
  vec2 pLocal = vec2(duP, p.y);
  vec2 ab = bLocal - aLocal;
  float t = clamp(dot(pLocal - aLocal, ab) / max(dot(ab, ab), 0.000001), 0.0, 1.0);
  return distance(pLocal, aLocal + ab * t);
}

void main() {
  vec2 previous = texture2D(uLayerBase, vUv).rg;

  // Degenerate "segment" (a point to itself) handles a stroke that's still
  // just one dab, with no second point yet.
  float minDist = distanceToSegment(vUv, uPoints[0], uPoints[0]);
  for (int i = 0; i < MAX_STROKE_POINTS - 1; i++) {
    if (i + 1 >= uPointCount) break;
    minDist = min(minDist, distanceToSegment(vUv, uPoints[i], uPoints[i + 1]));
  }

  float innerRadius = uRadius * (1.0 - uFeather);
  float falloff = 1.0 - smoothstep(innerRadius, uRadius, minDist);

  // Same Porter-Duff "over" compositing as before, against the frozen
  // pre-stroke base — see ISSUES.md's 2026-09-16 entry.
  float newMask = falloff + previous.g * (1.0 - falloff);
  float newValue = newMask > 0.0
    ? (uTargetValue * falloff + previous.r * previous.g * (1.0 - falloff)) / newMask
    : previous.r;
  gl_FragColor = vec4(newValue, newMask, 0.0, 1.0);
}
