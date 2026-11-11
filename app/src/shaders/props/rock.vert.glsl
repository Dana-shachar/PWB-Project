// three.js's shadow mapping (its ShadowMaterial's pieces): rocks cast onto this surface through the sun's shadow map.
#include <common>
#include <shadowmap_pars_vertex>
// One rock shape, instanced (props/rockScatter.ts): a convex hull bent by noise. The instance matrix places it on the
// patch's ground, sunk and leaning with the slope (set on the CPU from the patch's own heights).
uniform float uShapeSeed;
uniform float uShapeBottom; // the shape's flat base (props/rockScatter.ts)
uniform float uPixelsPerUnit; // screen pixels a world unit spans at distance 1 (view height / 2 tan(fov / 2))
uniform float uChunkSize;
uniform vec3 uCameraPosition;
uniform float uDrawDistance; // world units; rocks fade over its last fifth
attribute vec3 aRock; // per rock: hue turn and brightness (0 to 1), the ground's raw height under it
varying vec3 vWorldPosition;
varying vec3 vFromEye; // the point relative to the eye, built from small numbers, for the flat faces
varying vec3 vLocal; // the shape's own point, for its solid texture
varying float vHeightShare; // 0 at the shape's bottom, 1 at its top, for the darker base
varying vec3 vRock;
varying float vSizeMeters;
varying vec2 vChunkUv;

const float SHAPE_NOISE = 0.15; // how far noise moves a corner, as a share of the size. TUNABLE
const float SHAPE_FREQUENCY = 1.7;
// A rock shrinks away below this many pixels on screen, gone at half of it, so far rocks drop out unseen. TUNABLE
const float MIN_PIXELS = 2.0;

void main() {
  // No noise on the flat base, so it stays flat on the ground.
  float baseFade = smoothstep(uShapeBottom, uShapeBottom + 0.1, position.y);
  vec3 shape = position * (1.0 + SHAPE_NOISE * baseFade * simplexNoise3D(position * SHAPE_FREQUENCY, uShapeSeed));
  vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 offset = mat3(modelMatrix) * mat3(instanceMatrix) * shape; // from the rock's center, small
  vec3 world = center + offset;
  float size = max(length(instanceMatrix[0].xyz), max(length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)));
  float pixels = size * uPixelsPerUnit / max(distance(uCameraPosition, center), 1e-6);
  float distanceFade = 1.0 - smoothstep(0.8 * uDrawDistance, uDrawDistance, distance(uCameraPosition, center));
  offset *= smoothstep(0.5 * MIN_PIXELS, MIN_PIXELS, pixels) * distanceFade;
  world = center + offset;
  vFromEye = (center - uCameraPosition) + offset;

  vWorldPosition = world;
  vLocal = shape;
  vHeightShare = position.y + 0.5;
  vRock = aRock;
  vSizeMeters = size * 1000.0;
  vChunkUv = center.xz / uChunkSize + 0.5;
  vec4 worldPosition = vec4(world, 1.0);
  vec3 transformedNormal = normalMatrix * normal;
  #include <shadowmap_vertex>
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
