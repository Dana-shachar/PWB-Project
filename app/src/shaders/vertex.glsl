varying vec3 vNormal;

void main() {
  // World-space normal, passed to the fragment shader for lighting.
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
