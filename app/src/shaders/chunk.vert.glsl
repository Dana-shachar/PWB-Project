// Passes the mesh's own normal through to chunk.frag.glsl, in world terms so
// the shared light direction means the same thing here as on the planet.
// No displacement: the chunk's geometry already carries its heights, built
// from its terrain patch (voxel/smoothMesh.ts, voxel/meshWorker.ts).
varying vec3 vNormal;

void main() {
  vNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
