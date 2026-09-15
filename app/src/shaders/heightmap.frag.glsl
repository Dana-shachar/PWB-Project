// Depends on noise.glsl's perlinNoise3D() — concatenated together at usage
// time in map/heightmap.ts (no #include mechanism, per the ?raw-import +
// string-concatenation approach agreed on 2026-09-02).

varying vec2 vUv;

uniform float uSeed;
uniform float uFrequency;

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
  vec3 spherePosition = uvToSpherePosition(vUv);
  float n = perlinNoise3D(spherePosition * uFrequency, uSeed); // -1..1
  float height = n * 0.5 + 0.5;                                // remap to 0..1 for storage in the texture
  gl_FragColor = vec4(vec3(height), 1.0);
}
