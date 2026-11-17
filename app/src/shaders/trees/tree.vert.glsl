// A tree's trunk or leaves (trees/treeLook.ts). Leaves bend their normals outward from the canopy's center, so the
// crown shades as one soft mass (stylized foliage's spherical normals, BIOME-PLAN.md Trees).
uniform float uIsLeaf;
uniform vec3 uCanopyCenter; // local
uniform float uNormalBend; // 0 the part's own normal, 1 the canopy sphere's
attribute float aShade;
attribute float aAlong; // leaf parts: base 0 to tip 1 (trees/leafParts.ts); trunk has none, reads 0
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vLocal;
varying float vShade;
varying float vAlong;

void main() {
  vec3 objectNormal = normal;
  if (uIsLeaf > 0.5) {
    vec3 sphereNormal = normalize(position - uCanopyCenter + vec3(0.0, 1e-4, 0.0));
    objectNormal = normalize(mix(normal, sphereNormal, uNormalBend));
  }
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
  vLocal = position;
  vShade = aShade;
  vAlong = aAlong;
  gl_Position = projectionMatrix * viewMatrix * world;
}
