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

// ---- Terrace — a transform, not a generator; apply to any noise above ----
// Quantizes a -1..1 value into flat, discrete steps (plateaus with sharp
// edges between them), for a stepped/terraced terrain look.
float terrace(float noiseValue, float steps) {
  return floor(noiseValue * steps) / steps;
}

// ---- 3D hash helpers, for the 3D noise variants below ----
float hash1_3d(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

vec3 hash3_3d(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return fract(sin(p) * 43758.5453123);
}

// ---- Random (value noise) 3D — trilinear-interpolated hash ----
float randomNoise3D(vec3 p, float seed) {
  p += seedOffset3(seed);
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  float c000 = hash1_3d(i + vec3(0.0, 0.0, 0.0));
  float c100 = hash1_3d(i + vec3(1.0, 0.0, 0.0));
  float c010 = hash1_3d(i + vec3(0.0, 1.0, 0.0));
  float c110 = hash1_3d(i + vec3(1.0, 1.0, 0.0));
  float c001 = hash1_3d(i + vec3(0.0, 0.0, 1.0));
  float c101 = hash1_3d(i + vec3(1.0, 0.0, 1.0));
  float c011 = hash1_3d(i + vec3(0.0, 1.0, 1.0));
  float c111 = hash1_3d(i + vec3(1.0, 1.0, 1.0));

  float x00 = mix(c000, c100, u.x);
  float x10 = mix(c010, c110, u.x);
  float x01 = mix(c001, c101, u.x);
  float x11 = mix(c011, c111, u.x);
  float y0 = mix(x00, x10, u.y);
  float y1 = mix(x01, x11, u.y);
  return mix(y0, y1, u.z) * 2.0 - 1.0; // -1..1
}

// ---- Voronoi / cellular (Worley) noise 3D — 3x3x3 neighbor search ----
float voronoiNoise3D(vec3 p, float seed) {
  p += seedOffset3(seed);
  vec3 i = floor(p);
  vec3 f = fract(p);
  float minDist = 10.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 neighbor = vec3(float(x), float(y), float(z));
        vec3 point = hash3_3d(i + neighbor);
        vec3 diff = neighbor + point - f;
        minDist = min(minDist, length(diff));
      }
    }
  }
  return minDist * 2.0 - 1.0; // roughly -1..1
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

// ---- Simplex noise 3D ("snoise") — for sampling directly on a sphere ----
// Same reasoning as Perlin 3D above. Reference implementation (Stefan
// Gustavson / Ashima Arts, MIT license), verified 2026-09-14 against the
// canonical source (see README.md's References section). Reuses permute4
// from Perlin 3D above (identical function, same verified constants).
vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

float simplexNoise3D(vec3 v, float seed) {
  v += seedOffset3(seed);
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute4(permute4(permute4(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = 1.79284291400159 - 0.85373472095314 * vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3))); // roughly -1..1
}
