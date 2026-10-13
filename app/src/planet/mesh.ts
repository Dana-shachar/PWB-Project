import * as THREE from 'three';
import vertexShader from '../shaders/vertex.glsl?raw';
import fragmentShader from '../shaders/fragment.glsl?raw';

type CubeFace = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';
const CUBE_FACES: CubeFace[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];

// Face-local (u, v) in [-1, 1] -> a point on the cube, before normalizing
// onto the sphere. A parameterization chosen for this mesh alone (there's no
// external cubemap-sampling standard to match, since this feeds real
// geometry, not a samplerCube) — picked so every face's (dP/du) x (dP/dv)
// already points outward, hand-verified via cross product, so one winding
// rule (see cubeSphereGeometry below) works unchanged for all 6 faces.
function cubeFacePoint(face: CubeFace, u: number, v: number): THREE.Vector3 {
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

// The map wraps at longitude ±180°, and that wrap line crosses three of the
// six faces: straight down the middle of -X, and across each pole face from
// its center out to one edge (where z = 0 and x < 0). A triangle sitting on
// that line reads from both ends of the map at once, which smears the whole
// map width across it — visible as a bright/dark hairline, and as torn
// geometry once it drives displacement.
//
// -X is handled by unwrapping: its longitudes all sit near ±180°, so adding
// a full turn to the negative ones makes the face continuous. u then runs
// slightly past 1.0, which is fine, the heightmap texture already repeats
// (see Stage 05, ROADMAP.md).
//
// The pole faces can't be unwrapped that way, since longitude sweeps a full
// circle across them. They're split along the wrap line into two patches
// instead, each generating its own copy of the vertices on it, so no
// triangle ever spans the line. Same approach THREE.SphereGeometry uses at
// its own seam. See ISSUES.md, "Planet mesh and adaptive resolution".
const SEAM_FACE: CubeFace = '-X';

// One patch of a face: a v-range, plus which side of the wrap line it sits
// on. `seamSide` is 0 for faces that don't need splitting; otherwise -1 for
// the patch whose z is non-positive (longitude runs to -180°) and +1 for the
// patch whose z is non-negative (longitude runs to +180°).
interface FacePatch {
  face: CubeFace;
  vMin: number;
  vMax: number;
  seamSide: -1 | 0 | 1;
}

function facePatches(face: CubeFace): FacePatch[] {
  // +Y maps v to z as z = -v, so v >= 0 is the z <= 0 side; -Y maps z = v,
  // so the sides are reversed. Everything else needs no split.
  if (face === '+Y') {
    return [
      { face, vMin: 0, vMax: 1, seamSide: -1 },
      { face, vMin: -1, vMax: 0, seamSide: 1 },
    ];
  }
  if (face === '-Y') {
    return [
      { face, vMin: 0, vMax: 1, seamSide: 1 },
      { face, vMin: -1, vMax: 0, seamSide: -1 },
    ];
  }
  return [{ face, vMin: -1, vMax: 1, seamSide: 0 }];
}

// Same longitude/latitude <-> UV convention the shaders already use
// (fragment.glsl/vertex.glsl), just computed here on the CPU instead of
// read from a pre-supplied uv attribute — so neither shader needs to change.
function equirectUV(normalizedPosition: THREE.Vector3, patch: FacePatch): { u: number; v: number } {
  let longitude = Math.atan2(normalizedPosition.z, normalizedPosition.x);
  if (patch.face === SEAM_FACE && longitude < 0) longitude += Math.PI * 2;
  // Exactly on the wrap line (z is zero, x negative) atan2 returns +pi or
  // -pi depending only on the sign of zero, which is not something to leave
  // to chance. Pin it to whichever end of the map this patch belongs to, so
  // the two copies of those vertices land at u = 1 and u = 0 respectively.
  if (patch.seamSide === -1 && longitude > 0) longitude -= Math.PI * 2;
  if (patch.seamSide === 1 && longitude < 0) longitude += Math.PI * 2;
  const latitude = Math.asin(THREE.MathUtils.clamp(normalizedPosition.y, -1, 1));
  return {
    u: longitude / (Math.PI * 2) + 0.5,
    v: latitude / Math.PI + 0.5,
  };
}

// Builds the planet's geometry as a cube-sphere (6 flat grids, normalized
// onto the sphere) instead of THREE.SphereGeometry's lat/long grid — Phase 1
// of the chunked-LOD plan (see ROADMAP.md, Stage 02, and ISSUES.md). No
// quadtree/LOD yet — every face renders at the same fixed resolution, same
// as today's sphere; this phase only swaps the base topology and verifies it
// looks identical before adding any LOD complexity on top.
function cubeSphereGeometry(radius: number, segmentsPerFace: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vertsPerRow = segmentsPerFace + 1;
  // Rounded to even so a split patch gets a whole number of rows and its
  // boundary lands exactly on the wrap line rather than near it.
  const rowsPerFace = segmentsPerFace % 2 === 0 ? segmentsPerFace : segmentsPerFace + 1;

  for (const face of CUBE_FACES) {
    for (const patch of facePatches(face)) {
      const baseIndex = positions.length / 3;
      const rows = Math.round((rowsPerFace * (patch.vMax - patch.vMin)) / 2);
      for (let j = 0; j <= rows; j++) {
        const v = patch.vMin + (j / rows) * (patch.vMax - patch.vMin);
        for (let i = 0; i <= segmentsPerFace; i++) {
          const u = (i / segmentsPerFace) * 2 - 1;
          const normalized = cubeFacePoint(face, u, v).normalize();
          const { u: texU, v: texV } = equirectUV(normalized, patch);
          positions.push(normalized.x * radius, normalized.y * radius, normalized.z * radius);
          normals.push(normalized.x, normalized.y, normalized.z);
          uvs.push(texU, texV);
        }
      }
      // (i,j)-(i+1,j)-(i,j+1) and (i+1,j)-(i+1,j+1)-(i,j+1), for every face —
      // confirmed CCW/outward for all 6 by hand (cross product of each face's
      // own dP/du x dP/dv), not guessed, so no per-face special-casing needed.
      // Splitting a face into patches only subdivides its v range, so the
      // winding is unaffected.
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < segmentsPerFace; i++) {
          const a = baseIndex + j * vertsPerRow + i;
          const b = baseIndex + j * vertsPerRow + i + 1;
          const c = baseIndex + (j + 1) * vertsPerRow + i;
          const d = baseIndex + (j + 1) * vertsPerRow + i + 1;
          indices.push(a, b, c);
          indices.push(b, d, c);
        }
      }
    }
  }

  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

// Builds just the planet's geometry — split out from planet() so callers
// that need to rebuild geometry on a radius change (see SceneCanvas) don't
// have to throw away a whole new mesh + shader material just to get at
// .geometry.
export function planetGeometry(
  // TODO(DS): arbitrary placeholder — future scene-config/constants file, not a CSS token (feeds Three.js geometry, not styling)
  radius = 20,
  // TODO(DS): arbitrary placeholder — segments per cube face, not directly comparable to the old per-sphere widthSegments/heightSegments
  segmentsPerFace = 32,
): THREE.BufferGeometry {
  return cubeSphereGeometry(radius, segmentsPerFace);
}

// TEMPORARY — flip to draw the height value the planet actually reads, as
// grayscale on an undisplaced sphere, instead of the real shaded planet.
// A smooth field reads as a smooth gradient; anywhere the value jumps between
// neighboring points shows as a hard edge. Diagnosing the streaks at the
// poles (ISSUES.md, "Planet mesh and adaptive resolution"). Remove once done.
const DEBUG_HEIGHT_FIELD = false;

// A flat mid-gray 1x1 texture — "no displacement" per vertex.glsl's
// (height - 0.5) centering — used until a real heightmap texture is
// assigned, so the sphere isn't broken/black before that happens.
function flatHeightmapPlaceholder(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

// Builds the planet: real cube-sphere geometry, shaded by a custom GLSL ShaderMaterial
// basic diffuse lighting
export function planet(radius = 20, segmentsPerFace = 32): THREE.Mesh {
  const geometry = planetGeometry(radius, segmentsPerFace);
  if (DEBUG_HEIGHT_FIELD) {
    // TEMPORARY — reads uHeightMap exactly the way vertex.glsl does, but
    // draws the value instead of displacing by it, on an undisplaced sphere.
    // Kept as a ShaderMaterial with the same uniform keys as the real
    // material so SceneCanvas's effects, which reach into
    // material.uniforms.X directly, don't throw against it.
    const debugMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vDebugUv;
        void main() {
          vDebugUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      // Same sample vertex.glsl takes (.g, the elevation channel), recentred
      // into a visible range. Smooth gradient = smooth height field. A hard
      // edge = the value jumping between neighboring points, which is what
      // would tear the mesh once it drives displacement.
      fragmentShader: `
        uniform sampler2D uHeightMap;
        varying vec2 vDebugUv;
        void main() {
          float elevation = texture2D(uHeightMap, vDebugUv).g;
          gl_FragColor = vec4(vec3(elevation * 0.5 + 0.5), 1.0);
        }
      `,
      uniforms: {
        uBaseColor: { value: new THREE.Color(0xffffff) },
        uLightDirection: { value: new THREE.Vector3(1, 1, 1) },
        uAmbient: { value: 0.15 },
        uHeightMap: { value: flatHeightmapPlaceholder() },
        uDisplacementAmplitude: { value: 0 },
        uRadius: { value: radius },
      },
    });
    return new THREE.Mesh(geometry, debugMaterial);
  }
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
