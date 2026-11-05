import * as THREE from 'three';
import type { ChunkLakesRequest } from '../rivers/chunkLakes.worker';
import type { RiverClimate } from '../rivers/riverClimate';

const NO_LAKE = -1000; // NO_CHUNK_LAKE in rivers/chunkLakes.worker.ts
const SEA_ALWAYS_REACHES = -1000; // before a solve, the sea shows wherever the ground is below it
const EMPTY_LEVELS = [NO_LAKE, 0, SEA_ALWAYS_REACHES, 0];

// Keeps the chunk's lake levels fresh: reads the ground without stalling a frame, solves it off the main thread (latest
// request only), joining the planet's lakes with the chunk's own dips, and holds the result as a texture (R the level,
// G the lake's share of the tide, B the spill height the sea must reach) for the land's walls and the water. Lakes show
// only with Erosion on.
export class ChunkLakes {
  readonly texture: THREE.DataTexture;
  private readonly worker = new Worker(new URL('../rivers/chunkLakes.worker.ts', import.meta.url), { type: 'module' });
  private lastKey = '';
  private lastRevision = -1;
  private requestId = 0;
  private solving = false;
  private pending: ChunkLakesRequest | null = null;
  // The chunk's ground from the preview map, rows flipped to the ground grid's order (row 0 at +z, as groundHeightAt
  // reads), for choosing patch detail: the separate 257-sample grid was 7.75 km off the drawn ground (measured 2026-11-04).
  ground: { data: Float32Array; size: number } | null = null;

  constructor() {
    this.texture = new THREE.DataTexture(new Float32Array(EMPTY_LEVELS), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    this.texture.needsUpdate = true;
    this.worker.onmessage = (event: MessageEvent<{ levels: Float32Array; requestId: number }>) => {
      this.solving = false;
      const { levels, requestId } = event.data;
      if (requestId === this.requestId) this.setLevels(levels, Math.sqrt(levels.length / 4));
      this.sendPending();
    };
  }

  update(renderer: THREE.WebGLRenderer, preview: { target: THREE.WebGLRenderTarget; revision: number }, seaLevel: number, climate: RiverClimate, chunkKm: number, radiusKm: number, enabled: boolean): void {
    const key = [preview.revision, seaLevel, enabled, climate.rainfall, climate.temperature, climate.liquid, chunkKm, radiusKm].join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;
    const requestId = ++this.requestId;
    this.pending = null;
    // Levels solved on other ground would stand in the air or under it, so they go at once; a climate change keeps them.
    const groundChanged = preview.revision !== this.lastRevision;
    this.lastRevision = preview.revision;
    if (!enabled || groundChanged) this.setLevels(new Float32Array(EMPTY_LEVELS), 1);
    if (!enabled && !groundChanged) return;
    const size = preview.target.width;
    const buffer = new Float32Array(size * size * 4);
    void renderer.readRenderTargetPixelsAsync(preview.target, 0, 0, size, size, buffer).then(() => {
      if (requestId !== this.requestId) return;
      const ground = new Float32Array(size * size);
      const planetLakes = new Float32Array(size * size);
      const flipped = new Float32Array(size * size);
      for (let cell = 0; cell < ground.length; cell++) {
        ground[cell] = buffer[cell * 4 + 1];
        planetLakes[cell] = buffer[cell * 4 + 2] > ground[cell] ? buffer[cell * 4 + 2] : NO_LAKE; // B: the planet's lake level
        const row = Math.floor(cell / size);
        flipped[(size - 1 - row) * size + (cell % size)] = ground[cell];
      }
      this.ground = { data: flipped, size };
      if (!enabled) return;
      this.pending = { ground, planetLakes, size, seaLevel, climate: { rainfall: climate.rainfall, temperature: climate.temperature, liquid: climate.liquid }, chunkKm, radiusKm, requestId };
      this.sendPending();
    });
  }

  private sendPending(): void {
    if (this.solving || !this.pending) return;
    const request = this.pending;
    this.pending = null;
    this.solving = true;
    this.worker.postMessage(request, [request.ground.buffer, request.planetLakes.buffer]);
  }

  private setLevels(levels: Float32Array, size: number): void {
    if (this.texture.image.width !== size) {
      this.texture.dispose(); // a new size needs a new GPU texture
      this.texture.image = { data: levels, width: size, height: size } as typeof this.texture.image;
    } else {
      this.texture.image.data = levels;
    }
    this.texture.needsUpdate = true;
  }

  // The texel's start in the data for a point given as a share of the chunk.
  private texelAt(u: number, v: number): number {
    const size = this.texture.image.width;
    const col = Math.min(size - 1, Math.max(0, Math.round(u * (size - 1))));
    const row = Math.min(size - 1, Math.max(0, Math.round(v * (size - 1))));
    return (row * size + col) * 4;
  }

  // The lake level (raw height) at a point given as a share of the chunk, null off every lake.
  levelAt(u: number, v: number): number | null {
    const level = (this.texture.image.data as Float32Array)[this.texelAt(u, v)];
    return level > NO_LAKE ? level : null;
  }

  // The highest lake level the water sheet can draw over this point: each sheet vertex stands at the highest level among
  // its neighbors (chunkWater.vert.glsl), so a lake's sheet reaches past its last cell. Read across that same reach, or
  // walk mode found no water there and went under it (measured, 2026-11-04). sheetCells: WATER_SHEET_SEGMENTS.
  drawnLevelAt(u: number, v: number, sheetCells: number): number | null {
    let best: number | null = null;
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const level = this.levelAt(u + i / sheetCells, v + j / sheetCells);
        if (level !== null && (best === null || level > best)) best = level;
      }
    }
    return best;
  }

  // Whether the sea at this raw level reaches the point, rather than standing in a dip it has no way into.
  seaReaches(u: number, v: number, seaLevel: number): boolean {
    return (this.texture.image.data as Float32Array)[this.texelAt(u, v) + 2] <= seaLevel;
  }

  dispose(): void {
    this.worker.terminate();
    this.texture.dispose();
  }
}
