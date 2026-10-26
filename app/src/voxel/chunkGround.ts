import * as THREE from 'three';
import type { ElevationData } from './chunkGrid';

// The chunk's ground height anywhere on it, from a CPU copy of its heights,
// for camera picking and collision (Cesium's terrain picking and collision
// detection, [B56]). Same raw-to-world rule as chunk.vert.glsl.
export interface ChunkGround {
  heights: ElevationData;
  chunkSize: number;
  maxHeight: number;
}

// Ground height at (x, z), bilinear between samples; null off the chunk.
export function groundHeightAt(ground: ChunkGround, x: number, z: number): number | null {
  const { heights, chunkSize, maxHeight } = ground;
  const fractionU = x / chunkSize + 0.5;
  const fractionV = z / chunkSize + 0.5;
  if (fractionU < 0 || fractionU > 1 || fractionV < 0 || fractionV > 1) return null;
  const pixelX = fractionU * (heights.width - 1);
  const pixelY = fractionV * (heights.height - 1);
  const x0 = Math.floor(pixelX);
  const y0 = Math.floor(pixelY);
  const x1 = Math.min(heights.width - 1, x0 + 1);
  const y1 = Math.min(heights.height - 1, y0 + 1);
  const blendX = pixelX - x0;
  const blendY = pixelY - y0;
  const at = (px: number, py: number) => heights.data[py * heights.width + px];
  const raw = (at(x0, y0) * (1 - blendX) + at(x1, y0) * blendX) * (1 - blendY) + (at(x0, y1) * (1 - blendX) + at(x1, y1) * blendX) * blendY;
  return Math.max(0, raw + 0.5) * maxHeight;
}

const MARCH_STEPS = 512;
const REFINE_STEPS = 10;
const marchPoint = new THREE.Vector3();

// Where a ray first meets the ground: marched in even steps, then narrowed by bisection.
export function raycastGround(ground: ChunkGround, ray: THREE.Ray, maxDistance: number): THREE.Vector3 | null {
  const step = maxDistance / MARCH_STEPS;
  const isBelow = (distance: number) => {
    ray.at(distance, marchPoint);
    const height = groundHeightAt(ground, marchPoint.x, marchPoint.z);
    return height !== null && marchPoint.y <= height;
  };
  for (let i = 1; i <= MARCH_STEPS; i++) {
    if (!isBelow(i * step)) continue;
    let above = (i - 1) * step;
    let below = i * step;
    for (let k = 0; k < REFINE_STEPS; k++) {
      const mid = (above + below) / 2;
      if (isBelow(mid)) below = mid;
      else above = mid;
    }
    return ray.at(below, new THREE.Vector3());
  }
  return null;
}
