varying vec3 vWorldPosition;
varying vec2 vGridCoord; // the plane's own coordinates, so the lines turn with the grid when the planet spins

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vGridCoord = position.xz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
