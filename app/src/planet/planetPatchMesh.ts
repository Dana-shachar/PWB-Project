import * as THREE from 'three';
import vertexShader from '../shaders/vertex.glsl?raw';
import patchFragmentShaderBody from '../shaders/planetPatch.frag.glsl?raw';
import terrainGlsl from '../shaders/terrain.glsl?raw';
import { cubeFacePoint } from './cubeFace';
import { faceIndex, type TerrainPatch } from './patch';
import type { EdgeStitchFlags } from './planetPatches';
import { buildRampUniformArrays, MAX_COLOR_STOPS, type ColorStop } from './colorRamp';

const patchFragmentShader = terrainGlsl + patchFragmentShaderBody;

// How far inward (as a fraction of radius) a patch's outer edge drops to
// form its skirt — a thin wall hiding any sliver left where this patch meets
// a neighbor (stitching and cross-face balancing, planet/planetPatches.ts,
// do the actual joining; this is the safety cover at grazing angles).
// Deliberately small: big enough to cover a plausible height/depth mismatch at the
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
const NO_STITCH: EdgeStitchFlags = { top: false, bottom: false, left: false, right: false };

// Generalizes Stage 1's single-edge stitch (top only) to all four edges,
// plus the corner case where two adjacent edges both need it at once —
// the one case de Boer's own geomipmapping fan technique doesn't cover (it
// bridges one edge's 2:1 density change, not two meeting at a shared
// point). Architecture: the four corners are built once as single shared
// vertices (not owned by either adjacent edge), so two independently-
// doubled edges always agree on where they meet; each edge is built as its
// own strip of points strictly between its two corners (plain or doubled
// density, per computeStitchFlags); the interior stays a plain fixed grid,
// one ring smaller than the full patch, and is stitched to each edge the
// same way Stage 1 already did. A corner's own small unit cell (bounded by
// its two adjacent edges' nearest points and the interior's own nearest
// point) is a simple, convex polygon in parameter space whatever the mix
// of doubled/plain edges (4, 5, or 6 points), so a fan from the corner
// vertex itself always triangulates it correctly — reasoned through
// directly via worked examples (0, 1, and 2 doubled edges at one corner),
// not asserted. See ISSUES.md [B28], Stage 2/3.
export function buildPatchGeometry(
  patch: TerrainPatch,
  radius: number,
  resolution: number,
  stitchFlags: EdgeStitchFlags = NO_STITCH,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  function pushGridVertex(localU: number, localV: number, radiusOverride: number): number {
    const faceU = patch.min.x + localU * (patch.max.x - patch.min.x);
    const faceV = patch.min.y + localV * (patch.max.y - patch.min.y);
    const unit = cubeFacePoint(patch.face, faceU, faceV).normalize();
    positions.push(unit.x * radiusOverride, unit.y * radiusOverride, unit.z * radiusOverride);
    normals.push(unit.x, unit.y, unit.z);
    uvs.push(localU, localV);
    return positions.length / 3 - 1;
  }

  const n = resolution;
  const cornerTL = pushGridVertex(0, 0, radius);
  const cornerTR = pushGridVertex(1, 0, radius);
  const cornerBL = pushGridVertex(0, 1, radius);
  const cornerBR = pushGridVertex(1, 1, radius);

  // One edge's own points strictly between its two corners — doubled
  // density (2n-1 points) when stitched to a neighbor (same face or across a cube edge) one level
  // finer, the plain fixed density (n-1 points) this always used otherwise.
  // Returns both the vertex indices and the parametric position each was
  // built at (needed for the skirt's own matching UVs below).
  function buildBetween(doubled: boolean, pointAt: (t: number) => number): { points: number[]; params: number[] } {
    const count = doubled ? n * 2 - 1 : n - 1;
    const points: number[] = [];
    const params: number[] = [];
    for (let k = 1; k <= count; k++) {
      const t = k / (count + 1);
      points.push(pointAt(t));
      params.push(t);
    }
    return { points, params };
  }
  const top = buildBetween(stitchFlags.top, (t) => pushGridVertex(t, 0, radius));
  const bottom = buildBetween(stitchFlags.bottom, (t) => pushGridVertex(t, 1, radius));
  const left = buildBetween(stitchFlags.left, (t) => pushGridVertex(0, t, radius));
  const right = buildBetween(stitchFlags.right, (t) => pushGridVertex(1, t, radius));

  // The interior, always plain fixed density, (n-1)x(n-1) — one ring
  // smaller than the full patch, since stitching is only ever needed at
  // the patch's own outer boundary.
  const interiorRows: number[][] = [];
  for (let j = 1; j < n; j++) {
    const row: number[] = [];
    for (let i = 1; i < n; i++) row.push(pushGridVertex(i / n, j / n, radius));
    interiorRows.push(row);
  }

  // Interior-to-interior: the plain grid this always used, now scoped to
  // just the interior (the outer ring is handled separately below).
  for (let j = 0; j < interiorRows.length - 1; j++) {
    const rowTop = interiorRows[j];
    const rowBottom = interiorRows[j + 1];
    for (let i = 0; i < rowTop.length - 1; i++) {
      indices.push(rowTop[i], rowTop[i + 1], rowBottom[i]);
      indices.push(rowTop[i + 1], rowBottom[i + 1], rowBottom[i]);
    }
  }

  // One edge's own middle span, stitched to its adjacent interior row/
  // column — a 3-triangle fan per coarse cell when doubled (de Boer's
  // geomipmapping, see REFERENCES.md), a plain 2-triangle quad otherwise.
  // Reserves exactly the first/last 1 (doubled) or 0 (plain) of `between`'s
  // own points for the corner fans below to use instead, so neither
  // double-covers nor leaves a gap right at the corners.
  function stitchEdgeToInterior(between: number[], interiorRow: number[], doubled: boolean) {
    for (let i = 0; i < interiorRow.length - 1; i++) {
      const rowLeft = interiorRow[i];
      const rowRight = interiorRow[i + 1];
      if (doubled) {
        const fineLeft = between[2 * i + 1];
        const fineMid = between[2 * i + 2];
        const fineRight = between[2 * i + 3];
        indices.push(fineLeft, fineMid, rowLeft);
        indices.push(fineMid, rowRight, rowLeft);
        indices.push(fineMid, fineRight, rowRight);
      } else {
        indices.push(between[i], between[i + 1], rowLeft);
        indices.push(between[i + 1], rowRight, rowLeft);
      }
    }
  }
  stitchEdgeToInterior(top.points, interiorRows[0], stitchFlags.top);
  stitchEdgeToInterior(bottom.points, interiorRows[interiorRows.length - 1], stitchFlags.bottom);
  stitchEdgeToInterior(
    left.points,
    interiorRows.map((row) => row[0]),
    stitchFlags.left,
  );
  stitchEdgeToInterior(
    right.points,
    interiorRows.map((row) => row[row.length - 1]),
    stitchFlags.right,
  );

  // A corner's own unit cell: a fan from the shared corner vertex across
  // however many points its two adjacent edges actually have there.
  function edgeEnd(between: number[], fromStart: boolean): [number, number] {
    return fromStart ? [between[0], between[1]] : [between[between.length - 1], between[between.length - 2]];
  }
  function buildCornerFan(
    corner: number,
    edgeA: [number, number],
    edgeADoubled: boolean,
    edgeB: [number, number],
    edgeBDoubled: boolean,
    interiorCorner: number,
  ) {
    const boundary: number[] = [corner];
    if (edgeADoubled) boundary.push(edgeA[0]);
    boundary.push(edgeADoubled ? edgeA[1] : edgeA[0]);
    boundary.push(interiorCorner);
    boundary.push(edgeBDoubled ? edgeB[1] : edgeB[0]);
    if (edgeBDoubled) boundary.push(edgeB[0]);
    for (let k = 1; k < boundary.length - 1; k++) indices.push(boundary[0], boundary[k], boundary[k + 1]);
  }
  buildCornerFan(cornerTL, edgeEnd(top.points, true), stitchFlags.top, edgeEnd(left.points, true), stitchFlags.left, interiorRows[0][0]);
  buildCornerFan(
    cornerTR,
    edgeEnd(right.points, true),
    stitchFlags.right,
    edgeEnd(top.points, false),
    stitchFlags.top,
    interiorRows[0][interiorRows[0].length - 1],
  );
  buildCornerFan(
    cornerBL,
    edgeEnd(bottom.points, true),
    stitchFlags.bottom,
    edgeEnd(left.points, false),
    stitchFlags.left,
    interiorRows[interiorRows.length - 1][0],
  );
  buildCornerFan(
    cornerBR,
    edgeEnd(right.points, false),
    stitchFlags.right,
    edgeEnd(bottom.points, false),
    stitchFlags.bottom,
    interiorRows[interiorRows.length - 1][interiorRows[interiorRows.length - 1].length - 1],
  );

  // Skirt: one extra ring per edge, same (u,v) as the edge it extends but
  // pulled to a smaller radius, stitched to that edge with its own
  // triangles. Four edges, each a simple strip, not a full second grid.
  const skirtRadius = radius * (1 - SKIRT_DEPTH_FRACTION);

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

  const zeros = (count: number) => new Array(count).fill(0);
  const ones = (count: number) => new Array(count).fill(1);
  addSkirtStrip([cornerTL, ...top.points, cornerTR], [0, ...top.params, 1], [0, ...zeros(top.points.length), 0]);
  addSkirtStrip([cornerBL, ...bottom.points, cornerBR], [0, ...bottom.params, 1], [1, ...ones(bottom.points.length), 1]);
  addSkirtStrip([cornerTL, ...left.points, cornerBL], [0, ...zeros(left.points.length), 0], [0, ...left.params, 1]);
  addSkirtStrip([cornerTR, ...right.points, cornerBR], [1, ...ones(right.points.length), 1], [0, ...right.params, 1]);

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
  // The ramp's stops — see
  // planet/colorRamp.ts. Generalizes the old fixed colorMid/colorHigh pair.
  colorStops: ColorStop[];
  elevationMin: number;
  elevationMax: number;
  displacementAmplitude: number;
  radius: number;
  // Wrap lighting amount, shared with the land chunk (Scene > Wrap).
  diffuseWrap: number;
  // What the screen-space-error selection reads (planet/planetPatches.ts),
  // not material uniforms: the Resolution slider as a maximum error in
  // pixels (lower is sharper), and the view's height in pixels and vertical
  // field of view.
  maxErrorPixels: number;
  viewHeightPixels: number;
  fieldOfViewRadians: number;
  // The camera's frustum and forward direction, so selection builds only what
  // is in view and notices a turn.
  frustum?: THREE.Frustum;
  viewDirection?: THREE.Vector3;
}

// Ground distance the bump gradient reads across, as a share of the radius,
// so lighting looks alike at every patch depth (the shader clamps it to 2-8
// of a patch's own texels).
const GRADIENT_STEP_RADIUS_FRACTION = 0.02;

export function createPatchMaterial(
  patch: TerrainPatch,
  heightMap: THREE.Texture,
  bakeSamples: number, // this patch's baked texture width, which sets the gradient step's texel clamp
  shared: PlanetSharedUniforms,
): THREE.ShaderMaterial {
  const ramp = buildRampUniformArrays(shared.colorStops);
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
      uRampColors: { value: ramp.colors },
      uRampPositions: { value: ramp.positions },
      uRampCount: { value: ramp.count },
      uElevationMin: { value: shared.elevationMin },
      uElevationMax: { value: shared.elevationMax },
      uHeightMap: { value: heightMap },
      uDisplacementAmplitude: { value: shared.displacementAmplitude },
      uRadius: { value: shared.radius },
      uPatchMin: { value: new THREE.Vector2(patch.min.x, patch.min.y) },
      uPatchMax: { value: new THREE.Vector2(patch.max.x, patch.max.y) },
      uFace: { value: faceIndex(patch.face) },
      uGradientStepWorld: { value: shared.radius * GRADIENT_STEP_RADIUS_FRACTION },
      uBakeSamples: { value: bakeSamples },
      uDiffuseWrap: { value: shared.diffuseWrap },
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
  const ramp = buildRampUniformArrays(shared.colorStops);
  const rampColors = u.uRampColors.value as THREE.Color[];
  for (let i = 0; i < MAX_COLOR_STOPS; i++) rampColors[i].copy(ramp.colors[i]);
  (u.uRampPositions.value as number[]).splice(0, MAX_COLOR_STOPS, ...ramp.positions);
  u.uRampCount.value = ramp.count;
  u.uElevationMin.value = shared.elevationMin;
  u.uElevationMax.value = shared.elevationMax;
  u.uDisplacementAmplitude.value = shared.displacementAmplitude;
  u.uRadius.value = shared.radius;
  u.uGradientStepWorld.value = shared.radius * GRADIENT_STEP_RADIUS_FRACTION;
  u.uDiffuseWrap.value = shared.diffuseWrap;
}
