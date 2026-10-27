varying vec3 vSphereDirection;
varying vec3 vWorldPosition;
void main() {
  vSphereDirection = position;
  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
