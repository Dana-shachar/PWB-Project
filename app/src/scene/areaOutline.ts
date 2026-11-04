import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { cubeFacePoint } from '../planet/cubeFace';
import type { TerrainPatch } from '../planet/patch';

// The land chunk's area drawn on the planet: a line along its square's edges, each point pushed onto the sphere the
// way the patches are (cubeFacePoint, normalized), so it follows the globe's curve. A child of the planet's group, it
// turns with the planet. three.js's Line2, as WebGL draws plain lines 1 px wide whatever the setting.
const POINTS_PER_EDGE = 32;
const OUTLINE_COLOR = '#e5c11f'; // the design system's color-accent
const OUTLINE_WIDTH_PX = 3;
export const AREA_OUTLINE_LIFT = 1.002; // above the highest terrain, so the line never sinks in

export class AreaOutline {
  readonly line: Line2;
  private material: LineMaterial;
  private positions = new Float32Array((POINTS_PER_EDGE * 4 + 1) * 3); // the last point repeats the first, to close it

  constructor() {
    this.material = new LineMaterial({ color: OUTLINE_COLOR, linewidth: OUTLINE_WIDTH_PX });
    this.line = new Line2(new LineGeometry(), this.material);
    this.line.frustumCulled = false;
    this.line.visible = false;
  }

  setResolution(width: number, height: number): void {
    this.material.resolution.set(width, height);
  }

  // surfaceRadius is the planet's radius plus its highest terrain, in scene units.
  set(patch: TerrainPatch | null, surfaceRadius: number): void {
    this.line.visible = !!patch;
    if (!patch) return;
    const corners = [
      [patch.min.x, patch.min.y],
      [patch.max.x, patch.min.y],
      [patch.max.x, patch.max.y],
      [patch.min.x, patch.max.y],
    ];
    let idx = 0;
    for (let edge = 0; edge < 4; edge++) {
      const [startU, startV] = corners[edge];
      const [endU, endV] = corners[(edge + 1) % 4];
      for (let i = 0; i < POINTS_PER_EDGE; i++) {
        const share = i / POINTS_PER_EDGE;
        const point = cubeFacePoint(patch.face, startU + (endU - startU) * share, startV + (endV - startV) * share)
          .normalize()
          .multiplyScalar(surfaceRadius * AREA_OUTLINE_LIFT);
        this.positions[idx++] = point.x;
        this.positions[idx++] = point.y;
        this.positions[idx++] = point.z;
      }
    }
    this.positions.copyWithin(idx, 0, 3);
    // setPositions makes new buffers, so each outline gets a fresh geometry and the old one's are released.
    this.line.geometry.dispose();
    this.line.geometry = new LineGeometry().setPositions(this.positions);
  }

  dispose(): void {
    this.line.geometry.dispose();
    this.material.dispose();
  }
}
