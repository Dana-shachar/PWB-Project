import * as THREE from 'three';

// The cube the planet is built from, shared by the planet's own geometry
// (mesh.ts) and by terrain patches (patch.ts). Both have to agree exactly:
// a patch bakes terrain for an area, and the mesh draws that same area, so
// any difference between the two shows up as terrain not lining up with the
// ground under it.
export type CubeFace = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';
export const CUBE_FACES: CubeFace[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];

// Face-local (u, v) in [-1, 1] -> a point on the cube, before normalizing
// onto the sphere. A parameterization chosen for this project alone (there's
// no external cubemap-sampling standard to match, since this feeds real
// geometry, not a samplerCube) — picked so every face's (dP/du) x (dP/dv)
// already points outward, hand-verified via cross product, so one winding
// rule works unchanged for all 6 faces.
//
// Mirrored in GLSL in heightmap.frag.glsl's cubeFacePoint(). Keep the two
// identical.
export function cubeFacePoint(face: CubeFace, u: number, v: number): THREE.Vector3 {
  switch (face) {
    case '+X':
      return new THREE.Vector3(1, v, -u);
    case '-X':
      return new THREE.Vector3(-1, v, u);
    case '+Y':
      return new THREE.Vector3(u, 1, -v);
    case '-Y':
      return new THREE.Vector3(u, -1, v);
    case '+Z':
      return new THREE.Vector3(u, v, 1);
    case '-Z':
      return new THREE.Vector3(-u, v, -1);
  }
}
