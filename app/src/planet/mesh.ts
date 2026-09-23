import * as THREE from 'three';
import vertexShader from '../shaders/vertex.glsl?raw';
import fragmentShader from '../shaders/fragment.glsl?raw';

// Builds just the sphere geometry — split out from planet() so callers that
// need to rebuild geometry on a radius change (see SceneCanvas) don't have to
// throw away a whole new mesh + shader material just to get at .geometry.
export function planetGeometry(
  // TODO(DS): arbitrary placeholder — future scene-config/constants file, not a CSS token (feeds Three.js geometry, not styling)
  radius = 20,
  // TODO(DS): arbitrary placeholder — same as radius above
  widthSegments = 64,
  // TODO(DS): arbitrary placeholder — same as radius above
  heightSegments = 32,
): THREE.SphereGeometry {
  return new THREE.SphereGeometry(radius, widthSegments, heightSegments);
}

// A flat mid-gray 1x1 texture — "no displacement" per vertex.glsl's
// (height - 0.5) centering — used until a real heightmap texture is
// assigned, so the sphere isn't broken/black before that happens.
function flatHeightmapPlaceholder(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

// Builds the planet: real sphere geometry, shaded by a custom GLSL ShaderMaterial
// basic diffuse lighting
export function planet(radius = 20, widthSegments = 64, heightSegments = 32): THREE.Mesh {
  const geometry = planetGeometry(radius, widthSegments, heightSegments);
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
      uHeightMap: { value: flatHeightmapPlaceholder() },
      // TODO(DS): arbitrary placeholder — "global height" multiplier (Stage B, 2026-09-14 plan)
      uDisplacementAmplitude: { value: radius * 0.15 },
      // So the fragment shader's unit-sphere tangent math can be scaled into
      // the same real-world units as uDisplacementAmplitude — see ISSUES.md, 2026-09-16.
      uRadius: { value: radius },
    },
  });
  return new THREE.Mesh(geometry, material);
}
