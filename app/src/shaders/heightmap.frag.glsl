// Depends on noise.glsl's noise functions — concatenated together at usage
// time in map/heightmap.ts (no #include mechanism, per the ?raw-import +
// string-concatenation approach agreed on 2026-09-02).

varying vec2 vUv;

uniform float uSeed;
uniform float uFrequency;
uniform float uNoiseType; // 0=random, 1=perlin, 2=simplex, 3=voronoi, 4=ridged, 5=none, 6=octaves, 7=terrace
uniform float uOctaves;
uniform float uPersistence;
uniform float uLacunarity;
uniform float uTerraceSteps;

const int MAX_OCTAVES = 8; // loop upper bound — actual count is uOctaves, via the break below

// fBm (fractal Brownian motion): sums several octaves of Perlin noise at
// increasing frequency (lacunarity) and decreasing amplitude (persistence).
// Standard formula — verified against thebookofshaders.com/13, 2026-09-14.
float fbm3D(vec3 p, float seed) {
  float value = 0.0;
  float amplitude = 1.0;
  float maxAmplitude = 0.0;
  vec3 samplePoint = p;
  for (int i = 0; i < MAX_OCTAVES; i++) {
    if (i >= int(uOctaves)) break;
    value += amplitude * perlinNoise3D(samplePoint, seed);
    maxAmplitude += amplitude;
    samplePoint *= uLacunarity;
    amplitude *= uPersistence;
  }
  return value / maxAmplitude; // normalize back to roughly -1..1
}

// Converts an equirectangular UV coordinate to its position on the unit
// sphere. Sampling noise at this 3D point (rather than at the flat UV
// directly) is what avoids pole-pinching and seam artifacts once this
// texture displaces a sphere — see noise.glsl's perlinNoise3D comment.
vec3 uvToSpherePosition(vec2 uv) {
  float longitude = (uv.x - 0.5) * 2.0 * 3.14159265;
  float latitude = (uv.y - 0.5) * 3.14159265;
  float cosLatitude = cos(latitude);
  return vec3(cosLatitude * cos(longitude), sin(latitude), cosLatitude * sin(longitude));
}

void main() {
  vec3 p = uvToSpherePosition(vUv) * uFrequency;
  float n;

  if (uNoiseType < 0.5) {
    n = randomNoise3D(p, uSeed);
  } else if (uNoiseType < 1.5) {
    n = perlinNoise3D(p, uSeed);
  } else if (uNoiseType < 2.5) {
    n = simplexNoise3D(p, uSeed);
  } else if (uNoiseType < 3.5) {
    n = voronoiNoise3D(p, uSeed);
  } else if (uNoiseType < 4.5) {
    n = ridge(perlinNoise3D(p, uSeed)); // ridged is a modifier on Perlin, not its own generator
  } else if (uNoiseType < 5.5) {
    n = 0.0; // none — flat, no displacement
  } else if (uNoiseType < 6.5) {
    n = fbm3D(p, uSeed); // octaves is a modifier on Perlin, not its own generator
  } else {
    n = terrace(perlinNoise3D(p, uSeed), uTerraceSteps); // terrace is a modifier on Perlin, not its own generator
  }

  float height = n * 0.5 + 0.5; // remap to 0..1 for storage in the texture
  gl_FragColor = vec4(vec3(height), 1.0);
}
