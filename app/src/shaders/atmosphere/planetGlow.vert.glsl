// The planet's rim glow (Fresnel rim), after Lee Stemkoski's three.js glow demo: intensity = pow(c - dot(N, V), p),
// with N and V the surface normal and the view vector, both in view space.
uniform vec3 viewVector;
uniform float c;
uniform float p;
varying float intensity;
void main() {
  vec3 viewNormal = normalize(normalMatrix * normal);
  vec3 viewDirection = normalize(normalMatrix * viewVector);
  intensity = pow(max(c - dot(viewNormal, viewDirection), 0.0), p);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
