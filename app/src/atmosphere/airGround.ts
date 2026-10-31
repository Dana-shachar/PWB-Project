import * as THREE from 'three';
import type { HeightmapPipeline, NoiseLayer } from '../map/heightmap';
import { CUBE_FACES, cubeFacePoint } from '../planet/cubeFace';
import { createPatchTarget, faceIndex } from '../planet/patch';
import { planetAirUniforms } from './planetAir';

// The air's ground (Dana, 2026-10-30): the planet's visible surface (the sea over water) averaged over a wide area, so
// the haze, glow and clouds follow the planet's broad shape while lone jagged peaks rise through them. Height fog
// (Quilez) measured from this ground instead of a sphere; the averaging width is inferred, TUNABLE.
const SAMPLES = 33; // per cube face, read from the planet's own bake
const CELLS = 16; // per face of the smoothed cube map
const AIR_GROUND_SMOOTHING = 0.3; // radians: the averaging width, what counts as "broad" rather than a lone peak
const SMOOTHING_REACH = Math.cos(AIR_GROUND_SMOOTHING * 3); // samples beyond three widths add nothing

export interface AirGround {
  texture: THREE.CubeTexture;
  // How far the real surface typically rises above the averaged one (root mean square, raw units): 0 on a smooth
  // planet, larger on a jagged one, so the glow and clouds can sit further out.
  jaggedness: number;
  // Shared by every atmosphere material, so one update reaches them all.
  uniforms: Pick<typeof planetAirUniforms, 'uAirGround' | 'uAirAmplitude'>;
}

function emptyFace(): THREE.DataTexture {
  const face = new THREE.DataTexture(new Float32Array(CELLS * CELLS * 4), CELLS, CELLS, THREE.RGBAFormat, THREE.FloatType);
  face.needsUpdate = true;
  return face;
}

export function createAirGround(): AirGround {
  const texture = new THREE.CubeTexture(Array.from({ length: 6 }, emptyFace));
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.FloatType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  planetAirUniforms.uAirGround.value = texture;
  return { texture, jaggedness: 0, uniforms: { uAirGround: planetAirUniforms.uAirGround, uAirAmplitude: planetAirUniforms.uAirAmplitude } };
}

// The direction of a cube map texel, by the GL cube map face table (faces +X, -X, +Y, -Y, +Z, -Z).
function cubeMapDirection(face: number, s: number, t: number): THREE.Vector3 {
  switch (face) {
    case 0: return new THREE.Vector3(1, -t, -s).normalize();
    case 1: return new THREE.Vector3(-1, -t, s).normalize();
    case 2: return new THREE.Vector3(s, 1, t).normalize();
    case 3: return new THREE.Vector3(s, -1, -t).normalize();
    case 4: return new THREE.Vector3(s, -t, 1).normalize();
    default: return new THREE.Vector3(-s, -t, -1).normalize();
  }
}

// The cube map texel a direction falls in: the inverse of cubeMapDirection.
function cubeMapTexel(dir: THREE.Vector3): number {
  const [ax, ay, az] = [Math.abs(dir.x), Math.abs(dir.y), Math.abs(dir.z)];
  let face: number, s: number, t: number;
  if (ax >= ay && ax >= az) [face, s, t] = dir.x > 0 ? [0, -dir.z / ax, -dir.y / ax] : [1, dir.z / ax, -dir.y / ax];
  else if (ay >= az) [face, s, t] = dir.y > 0 ? [2, dir.x / ay, dir.z / ay] : [3, dir.x / ay, -dir.z / ay];
  else [face, s, t] = dir.z > 0 ? [4, dir.x / az, -dir.y / az] : [5, -dir.x / az, -dir.y / az];
  const cell = (coord: number) => Math.min(CELLS - 1, Math.floor(((coord + 1) / 2) * CELLS));
  return (face * CELLS + cell(t)) * CELLS + cell(s);
}

// Bakes the surface at low detail on each face, keeps the sea surface where the ground is under water, then averages it
// by direction with a Gaussian weight. Raw height units; uAirAmplitude turns them into world units. Run on terrain or
// sea level changes only.
export function bakeAirGround(airGround: AirGround, renderer: THREE.WebGLRenderer, pipeline: HeightmapPipeline, layers: NoiseLayer[], seaLevel: number | null): void {
  const target = createPatchTarget(SAMPLES);
  const directions: THREE.Vector3[] = [];
  const heights: number[] = [];
  for (const face of CUBE_FACES) {
    const min = new THREE.Vector2(-1, -1);
    const max = new THREE.Vector2(1, 1);
    pipeline.bakeRegionToTarget(renderer, { layers, face: faceIndex(face), min, max, resolution: target.width }, target);
    const { data, width } = pipeline.getRegionElevationData(renderer, target);
    for (let row = 0; row < width; row++) {
      for (let col = 0; col < width; col++) {
        // The readback runs top to bottom, so the first row is the face's top (v = 1).
        directions.push(cubeFacePoint(face, -1 + (2 * col) / (width - 1), 1 - (2 * row) / (width - 1)).normalize());
        const height = data[row * width + col];
        heights.push(seaLevel === null ? height : Math.max(height, seaLevel));
      }
    }
  }
  target.dispose();

  const spread = 2 * AIR_GROUND_SMOOTHING * AIR_GROUND_SMOOTHING;
  (airGround.texture.images as THREE.DataTexture[]).forEach((image, face) => {
    const values = image.image.data as Float32Array;
    for (let y = 0; y < CELLS; y++) {
      for (let x = 0; x < CELLS; x++) {
        const dir = cubeMapDirection(face, (2 * x + 1) / CELLS - 1, (2 * y + 1) / CELLS - 1);
        let sum = 0;
        let weightSum = 0;
        for (let i = 0; i < directions.length; i++) {
          const cos = dir.dot(directions[i]);
          if (cos < SMOOTHING_REACH) continue;
          const angle = Math.acos(Math.min(1, cos));
          const weight = Math.exp(-(angle * angle) / spread);
          sum += heights[i] * weight;
          weightSum += weight;
        }
        values[(y * CELLS + x) * 4] = weightSum > 0 ? sum / weightSum : 0;
      }
    }
    image.needsUpdate = true;
  });
  airGround.texture.needsUpdate = true;

  // Only what rises above the average counts: dips under it don't push the air out.
  const smoothed = (airGround.texture.images as THREE.DataTexture[]).flatMap((image) => Array.from(image.image.data as Float32Array).filter((_, i) => i % 4 === 0));
  let squares = 0;
  for (let i = 0; i < directions.length; i++) squares += Math.max(heights[i] - smoothed[cubeMapTexel(directions[i])], 0) ** 2;
  airGround.jaggedness = Math.sqrt(squares / directions.length);
}
