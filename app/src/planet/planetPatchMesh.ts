import * as THREE from 'three';
import vertexShader from '../shaders/vertex.glsl?raw';
import patchFragmentShaderBody from '../shaders/planetPatch.frag.glsl?raw';
import terrainGlsl from '../shaders/terrain.glsl?raw';
import { cubeFacePoint } from './cubeFace';
import { faceIndex, type TerrainPatch } from './patch';

const patchFragmentShader = terrainGlsl + patchFragmentShaderBody;

// How far inward (as a fraction of radius) a patch's outer edge drops to
// form its skirt — a thin wall hiding any crack where this patch meets a
// neighbor baked at a different depth (same technique real chunked-LOD
// terrain engines use instead of true vertex-welding across every possible
// neighbor combination; see planet/planetPatches.ts's own comment on why
// full cross-face seam-matching is out of scope for this pass). Deliberately
// small: big enough to cover a plausible height/depth mismatch at the
// resolutions this project actually reaches, not an arbitrary guess at the
// scale of the whole radius.
const SKIRT_DEPTH_FRACTION = 0.01;

// One patch's own geometry: a (resolution+1)^2 grid over its own face-local
// sub-rectangle, in cube-sphere positions exactly like planet/mesh.ts's
// cubeSphereGeometry builds the whole-globe mesh, plus a skirt ring around
// the outside. vertex.glsl (shared, unchanged) displaces this along `normal`
// using each vertex's own `uv`, identical to how the whole-globe mesh does
// it — a patch is just a smaller, more sharply focused piece of the same
// parameterization, not a different one.
export function buildPatchGeometry(patch: TerrainPatch, radius: number, resolution: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vertsPerRow = resolution + 1;

  function pushGridVertex(localU: number, localV: number, radiusOverride: number) {
    const faceU = patch.min.x + localU * (patch.max.x - patch.min.x);
    const faceV = patch.min.y + localV * (patch.max.y - patch.min.y);
    const unit = cubeFacePoint(patch.face, faceU, faceV).normalize();
    positions.push(unit.x * radiusOverride, unit.y * radiusOverride, unit.z * radiusOverride);
    normals.push(unit.x, unit.y, unit.z);
    uvs.push(localU, localV);
  }

  for (let j = 0; j <= resolution; j++) {
    const localV = j / resolution;
    for (let i = 0; i <= resolution; i++) {
      const localU = i / resolution;
      pushGridVertex(localU, localV, radius);
    }
  }
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const a = j * vertsPerRow + i;
      const b = j * vertsPerRow + i + 1;
      const c = (j + 1) * vertsPerRow + i;
      const d = (j + 1) * vertsPerRow + i + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  // Skirt: one extra ring per edge, same (u,v) as the edge it extends but
  // pulled to a smaller radius, stitched to that edge with its own
  // triangles. Four edges, each a simple strip, not a full second grid.
  const skirtRadius = radius * (1 - SKIRT_DEPTH_FRACTION);
  const gridVertexCount = (resolution + 1) * (resolution + 1);

  function edgeIndex(i: number, j: number) {
    return j * vertsPerRow + i;
  }

  function addSkirtStrip(edgeIndices: number[], localUs: number[], localVs: number[]) {
    const skirtStart = positions.length / 3;
    for (let k = 0; k < edgeIndices.length; k++) {
      pushGridVertex(localUs[k], localVs[k], skirtRadius);
    }
    for (let k = 0; k < edgeIndices.length - 1; k++) {
      const topA = edgeIndices[k];
      const topB = edgeIndices[k + 1];
      const botA = skirtStart + k;
      const botB = skirtStart + k + 1;
      // Winding matches the main grid's own a-b-c / b-d-c order (outward-
      // facing), so the skirt reads as a continuation of the surface, not
      // an inside-out wall.
      indices.push(topA, topB, botA);
      indices.push(topB, botB, botA);
    }
  }

  const topRow: number[] = [];
  const topU: number[] = [];
  const topV: number[] = [];
  const bottomRow: number[] = [];
  const bottomU: number[] = [];
  const bottomV: number[] = [];
  const leftCol: number[] = [];
  const leftU: number[] = [];
  const leftV: number[] = [];
  const rightCol: number[] = [];
  const rightU: number[] = [];
  const rightV: number[] = [];
  for (let i = 0; i <= resolution; i++) {
    const u = i / resolution;
    topRow.push(edgeIndex(i, 0));
    topU.push(u);
    topV.push(0);
    bottomRow.push(edgeIndex(i, resolution));
    bottomU.push(u);
    bottomV.push(1);
  }
  for (let j = 0; j <= resolution; j++) {
    const v = j / resolution;
    leftCol.push(edgeIndex(0, j));
    leftU.push(0);
    leftV.push(v);
    rightCol.push(edgeIndex(resolution, j));
    rightU.push(1);
    rightV.push(v);
  }
  addSkirtStrip(topRow, topU, topV);
  addSkirtStrip(bottomRow, bottomU, bottomV);
  addSkirtStrip(leftCol, leftU, leftV);
  addSkirtStrip(rightCol, rightU, rightV);
  void gridVertexCount; // kept for clarity of intent even though unused directly — skirt indices are computed relative to each strip's own start

  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

// Shared uniform values every patch material needs the same copy of
// (lighting, color ramp, elevation range, camera position) — kept as one
// shape so PlanetPatchRenderer can push an update to every current patch's
// material in one pass, the same fields planet/mesh.ts's single material
// already carries, minus the per-patch ones (heightmap, patch bounds, face,
// sample offset), which this function sets once at creation and
// PlanetPatchRenderer never touches again for an existing patch.
export interface PlanetSharedUniforms {
  baseColor: THREE.Color;
  lightDirection: THREE.Vector3;
  ambient: number;
  lightIntensity: number;
  specularStrength: number;
  shininess: number;
  cameraPosition: THREE.Vector3;
  colorByElevation: number;
  colorMid: THREE.Color;
  colorHigh: THREE.Color;
  elevationMin: number;
  elevationMax: number;
  displacementAmplitude: number;
  radius: number;
}

export function createPatchMaterial(
  patch: TerrainPatch,
  heightMap: THREE.Texture,
  sampleOffset: number,
  shared: PlanetSharedUniforms,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: patchFragmentShader,
    // DoubleSide as a deliberate safety margin, not a correctness
    // requirement: this can't be visually verified in this pass (no way to
    // actually look at the running app from here), and a wrong skirt
    // triangle winding would otherwise just silently cull-and-vanish
    // instead of failing loudly. Worth revisiting once Dana can actually
    // see it; single-sided is the normal choice for closed, outward-facing
    // terrain like this.
    side: THREE.DoubleSide,
    uniforms: {
      uBaseColor: { value: shared.baseColor.clone() },
      uLightDirection: { value: shared.lightDirection.clone() },
      uAmbient: { value: shared.ambient },
      uLightIntensity: { value: shared.lightIntensity },
      uSpecularStrength: { value: shared.specularStrength },
      uShininess: { value: shared.shininess },
      uCameraPosition: { value: shared.cameraPosition.clone() },
      uColorByElevation: { value: shared.colorByElevation },
      uColorMid: { value: shared.colorMid.clone() },
      uColorHigh: { value: shared.colorHigh.clone() },
      uElevationMin: { value: shared.elevationMin },
      uElevationMax: { value: shared.elevationMax },
      uHeightMap: { value: heightMap },
      uDisplacementAmplitude: { value: shared.displacementAmplitude },
      uRadius: { value: shared.radius },
      uPatchMin: { value: new THREE.Vector2(patch.min.x, patch.min.y) },
      uPatchMax: { value: new THREE.Vector2(patch.max.x, patch.max.y) },
      uFace: { value: faceIndex(patch.face) },
      uSampleOffset: { value: sampleOffset },
    },
  });
}

// Applies every shared field to one material in place — called for every
// current patch whenever a shared value (lighting, color ramp, camera
// position, elevation range) changes, mirroring the single-mesh path's own
// `material.uniforms.X.value = Y` call sites in SceneCanvas.tsx.
export function applySharedUniforms(material: THREE.ShaderMaterial, shared: PlanetSharedUniforms): void {
  const u = material.uniforms;
  (u.uBaseColor.value as THREE.Color).copy(shared.baseColor);
  (u.uLightDirection.value as THREE.Vector3).copy(shared.lightDirection);
  u.uAmbient.value = shared.ambient;
  u.uLightIntensity.value = shared.lightIntensity;
  u.uSpecularStrength.value = shared.specularStrength;
  u.uShininess.value = shared.shininess;
  (u.uCameraPosition.value as THREE.Vector3).copy(shared.cameraPosition);
  u.uColorByElevation.value = shared.colorByElevation;
  (u.uColorMid.value as THREE.Color).copy(shared.colorMid);
  (u.uColorHigh.value as THREE.Color).copy(shared.colorHigh);
  u.uElevationMin.value = shared.elevationMin;
  u.uElevationMax.value = shared.elevationMax;
  u.uDisplacementAmplitude.value = shared.displacementAmplitude;
  u.uRadius.value = shared.radius;
}
