import * as THREE from 'three';
import vertexShader from '../shaders/vertex.glsl?raw';
import fragmentShader from '../shaders/fragment.glsl?raw';

// Builds the planet: real sphere geometry, shaded by a custom GLSL ShaderMaterial
// basic diffuse lighting
export function planet(
  // TODO(DS): arbitrary placeholder — future scene-config/constants file, not a CSS token (feeds Three.js geometry, not styling)
  radius = 20,
  // TODO(DS): arbitrary placeholder — same as radius above
  widthSegments = 64,
  // TODO(DS): arbitrary placeholder — same as radius above
  heightSegments = 32,
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      // TODO(DS): arbitrary placeholder color — future design-system/CSS token
      uBaseColor: { value: new THREE.Color(0x3a7bd5) },
      // TODO(DS): arbitrary placeholder — future design-system token (lighting direction)
      uLightDirection: { value: new THREE.Vector3(1, 1, 1) },
      // TODO(DS): arbitrary placeholder — future design-system token (ambient light level)
      uAmbient: { value: 0.15 },
    },
  });
  return new THREE.Mesh(geometry, material);
}
