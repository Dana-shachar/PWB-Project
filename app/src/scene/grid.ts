import * as THREE from 'three';
import vertexShader from '../shaders/scene/grid.vert.glsl?raw';
import fragmentShader from '../shaders/scene/grid.frag.glsl?raw';

// TODO(DS): arbitrary placeholder — large enough + fade short enough that
// the plane's finite edge is never actually reached/visible.
const PLANE_SIZE = 20000;

// Shader-based infinite-looking grid, replacing THREE.GridHelper (2026-09-14
// — the old one looked like a bounded CAD-software floor, not empty space).
// Ported from active-geometry-project's own raymarched grid look.
export function grid(minorSpacing = 10, fadeDistance = 3000): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
  geometry.rotateX(-Math.PI / 2); // PlaneGeometry defaults to the XY plane; lie flat on XZ instead
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uMinorSpacing: { value: minorSpacing },
      uFadeDistance: { value: fadeDistance },
    },
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Mesh(geometry, material);
}
