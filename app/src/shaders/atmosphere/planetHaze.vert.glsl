// The planet's haze: Stemkoski's glow vertex shader (intensity = pow(c - dot(N, V), p)), plus the world-space normal
// so the haze can follow the sunlight.
uniform vec3 viewVector;
uniform float c;
uniform float p;
varying float intensity;
varying vec3 vWorldNormal;
void main() {
  vec3 viewNormal = normalize(normalMatrix * normal);
  vec3 viewDirection = normalize(normalMatrix * viewVector);
  intensity = pow(max(c - dot(viewNormal, viewDirection), 0.0), p);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
