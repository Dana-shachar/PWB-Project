import * as THREE from 'three';
import { RIVER_LAKE_STRIDE, RIVER_VIEW_STRIDE } from './riverTree';

// TEMP: draws the rivers in view on the planet, to check them against the terrain before anything is carved.
const RIVER_DEBUG_DOT_SIZE = 3; // pixels

// Drawn over the terrain so hills don't cut the lines up; only the planet's far side is hidden.
const RIVER_DEBUG_VERTEX = `
varying float vFacing;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vFacing = dot(normalize(worldPosition.xyz - center), normalize(cameraPosition - worldPosition.xyz));
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
  gl_PointSize = ${RIVER_DEBUG_DOT_SIZE.toFixed(1)};
}`;
const RIVER_DEBUG_FRAGMENT = `
varying float vFacing;
void main() {
  if (vFacing < 0.0) discard;
  gl_FragColor = vec4(0.22, 0.9, 1.0, 1.0);
}`;
const LAKE_DEBUG_FRAGMENT = `
varying float vFacing;
void main() {
  if (vFacing < 0.0) discard;
  gl_FragColor = vec4(1.0, 0.75, 0.1, 1.0);
}`;

export function buildRiverDebugLines(segments: Float32Array, radius: number, displacementAmplitude: number): THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const count = segments.length / RIVER_VIEW_STRIDE;
  const vertices = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    for (let end = 0; end < 2; end++) {
      const source = i * RIVER_VIEW_STRIDE + end * 4;
      const distance = radius + segments[source + 3] * displacementAmplitude;
      for (let axis = 0; axis < 3; axis++) vertices[i * 6 + end * 3 + axis] = segments[source + axis] * distance;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  const material = new THREE.ShaderMaterial({ vertexShader: RIVER_DEBUG_VERTEX, fragmentShader: RIVER_DEBUG_FRAGMENT, depthTest: false, transparent: true });
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = 10;
  return lines;
}

export function buildLakeDebugDots(lakeNodes: Float32Array, radius: number, displacementAmplitude: number): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const count = lakeNodes.length / RIVER_LAKE_STRIDE;
  const vertices = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const source = i * RIVER_LAKE_STRIDE;
    const distance = radius + lakeNodes[source + 3] * displacementAmplitude;
    for (let axis = 0; axis < 3; axis++) vertices[i * 3 + axis] = lakeNodes[source + axis] * distance;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  const material = new THREE.ShaderMaterial({ vertexShader: RIVER_DEBUG_VERTEX, fragmentShader: LAKE_DEBUG_FRAGMENT, depthTest: false, transparent: true });
  const dots = new THREE.Points(geometry, material);
  dots.renderOrder = 10;
  return dots;
}
