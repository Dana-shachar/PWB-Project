// Reusable noise functions — reference implementations, not original work
// (the same widely-used, public algorithms that show up throughout shader
// literature: Book of Shaders, Ashima Arts' webgl-noise, iquilezles.org).
// All the base types are here now even though only Perlin is wired to a
// control yet — so adding the type-selector dropdown later doesn't require
// touching this file again.
//
// Every function takes a `seed` that offsets the sampling coordinate, so
// one shared seed field can drive whichever type is selected consistently.

vec2 seedOffset(float seed) {
  return vec2(seed * 37.234, seed * 17.921);
}

vec3 seedOffset3(float seed) {
  return vec3(seed * 37.234, seed * 17.921, seed * 61.417);
}

// ---- Shared hash helpers ----
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float hash1(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// ---- Random (value noise) ----
float randomNoise(vec2 p, float seed) {
  p += seedOffset(seed);
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash1(i);
  float b = hash1(i + vec2(1.0, 0.0));
  float c = hash1(i + vec2(0.0, 1.0));
  float d = hash1(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0; // -1..1
}

// ---- Perlin (classic gradient) noise ----
float perlinNoise(vec2 p, float seed) {
  p += seedOffset(seed);
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = dot(hash2(i), f);
  float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); // -1..1
}

// ---- Simplex noise (Ashima Arts style) ----
vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float simplexNoise(vec2 p, float seed) {
  p += seedOffset(seed);
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(p + dot(p, C.yy));
  vec2 x0 = p - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p3 = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p3 * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g); // roughly -1..1
}

// ---- Voronoi / cellular (Worley) noise ----
float voronoiNoise(vec2 p, float seed) {
  p += seedOffset(seed);
  vec2 i = floor(p);
  vec2 f = fract(p);
  float minDist = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = hash2(i + neighbor) * 0.5 + 0.5;
      vec2 diff = neighbor + point - f;
      minDist = min(minDist, length(diff));
    }
  }
  return minDist * 2.0 - 1.0; // roughly -1..1
}

// ---- Ridged — a transform, not a generator; apply to any noise above ----
float ridge(float noiseValue) {
  return 1.0 - abs(noiseValue);
}

// ---- Perlin 3D — for sampling noise directly on a sphere's surface ----
// Fixes the pole-pinching/seam artifacts a 2D-UV lookup gets on a sphere:
// sample at each vertex's actual 3D position on the unit sphere instead of
// its flat UV. Every point at a pole is then the *same* 3D coordinate
// regardless of longitude (so they get the same height, no more tearing),
// and the U=0/U=1 seam maps to the same meridian (so it matches, no crack).
// Classic reference implementation ("cnoise", Stefan Gustavson / Ian McEwan
// of Ashima Arts, MIT license), not original work — verified 2026-09-14
// against the canonical source (see README.md's References section).
vec4 permute4(vec4 x) {
  return mod(((x * 34.0) + 10.0) * x, 289.0);
}

float perlinNoise3D(vec3 p, float seed) {
  p += seedOffset3(seed);
  vec3 Pi0 = floor(p);
  vec3 Pi1 = Pi0 + vec3(1.0);
  Pi0 = mod(Pi0, 289.0);
  Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(p);
  vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.y, Pi0.y, Pi1.y, Pi1.y);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;

  vec4 ixy = permute4(permute4(ix) + iy);
  vec4 ixy0 = permute4(ixy + iz0);
  vec4 ixy1 = permute4(ixy + iz1);

  vec4 gx0 = ixy0 / 7.0;
  vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);

  vec4 gx1 = ixy1 / 7.0;
  vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);

  vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
  vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
  vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
  vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
  vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
  vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
  vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
  vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);

  vec4 norm0 = 1.79284291400159 - 0.85373472095314 *
    vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110));
  g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
  vec4 norm1 = 1.79284291400159 - 0.85373472095314 *
    vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111));
  g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;

  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.y, Pf0.z));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.x, Pf1.y, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.x, Pf0.y, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.y, Pf1.z));
  float n111 = dot(g111, Pf1);

  vec3 fadeXYZ = Pf0 * Pf0 * Pf0 * (Pf0 * (Pf0 * 6.0 - 15.0) + 10.0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fadeXYZ.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fadeXYZ.y);
  float n_xyz = mix(n_yz.x, n_yz.y, fadeXYZ.x);
  return 2.2 * n_xyz; // roughly -1..1
}
