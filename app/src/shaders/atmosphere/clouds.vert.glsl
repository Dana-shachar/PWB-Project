// The cloud layer sits a set height above the air's ground (airGround.glsl), so it follows the planet's broad shape.
uniform float uCloudBase; // world radius of the layer over ground at the planet's radius
uniform float uShellScale; // the mesh's own scale
uniform float uCloudLayer; // which stacked shell, 0 the lowest
uniform float uCloudLayerSpacing; // world units between shells
varying vec3 vSphereDirection;
varying vec3 vWorldPosition;
void main() {
  vec3 direction = normalize(position);
  vec3 local = direction * (uCloudBase + uCloudLayer * uCloudLayerSpacing + airGroundLift(direction)) / uShellScale;
  vSphereDirection = position;
  vWorldPosition = (modelMatrix * vec4(local, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
}
