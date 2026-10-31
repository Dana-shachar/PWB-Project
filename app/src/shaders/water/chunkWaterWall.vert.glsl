// The chunk water's side walls (voxel/chunkWater.ts), shaded in chunkWaterWall.frag.glsl.
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
