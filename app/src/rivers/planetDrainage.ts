// Planet drainage from stream power erosion on the globe map (Schott et al. 2023), the water plan's phase 1 (ROADMAP).
// Measured 2026-11-02 at 4096 x 2048: 7.5 ms a pass, about 540 passes for drainage to reach the sea; run at 2048 x 1024.
// Drainage runs first with erosion off, is saved, then erosion runs on top, so Erosion continues or restarts from there.
import * as THREE from 'three';
import quadVertexGlsl from '../shaders/heightmap/heightmapBrush.vert.glsl?raw';
import copyGlsl from '../shaders/erosion/copy.frag.glsl?raw';
import streamPowerGlsl from '../shaders/erosion/streamPowerPlanet.frag.glsl?raw';
import seedGlsl from '../shaders/erosion/streamPowerSeed.frag.glsl?raw';
import { readRenderTargetAsync } from '../map/heightmap';

// Schott's defaults (spe_shader.glsl), in his units: meters and his drainage area.
const SCHOTT_K = 0.0005;
// Hillslope smoothing per pass at Strength 1, as a share of the height difference (streamPowerPlanet.frag.glsl).
// Spreads the carving across whole slopes, so valleys widen instead of staying one 18 km cell. Inferred, TUNABLE
const HILLSLOPE_SHARE = 0.05;
const MAX_HILLSLOPE_SHARE = 0.2; // the explicit step's stability limit, as in the shader
const SCHOTT_DT = 50;
const SCHOTT_AREA_EXPONENT = 0.8;
const SCHOTT_SLOPE_EXPONENT = 2;
const SCHOTT_FLOW_EXPONENT = 1;
const DRAINAGE_PASSES = 350; // half the 540 measured at twice the size, plus a margin. Inferred, TUNABLE
const PASSES_PER_FRAME = 4; // about a quarter of the larger map's cost each, so frames stay short. Inferred, TUNABLE

export interface DrainageResult {
  eroded: Float32Array; // meters above sea level, rows as uploaded
  drainage: Float32Array; // Schott's drainage area
  cellDiagonal: number; // meters at the equator, Schott's area of one cell
  metersPerUnit: number; // the globe map's height units to meters
  width: number;
  height: number;
}

function makeTarget(width: number, height: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.FloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export class PlanetDrainage {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private seedMaterial: THREE.ShaderMaterial;
  private passMaterial: THREE.ShaderMaterial;
  private copyMaterial: THREE.ShaderMaterial;
  private targets: THREE.WebGLRenderTarget[] = [];
  private checkpoint: THREE.WebGLRenderTarget | null = null; // the drainage-only state
  private checkpointReady = false;
  private current = 0;
  private erosionPassesDone = 0;
  private strength = 1; // scales Schott's k, the shared Erosion Strength
  private metersPerUnit = 1;
  private generation = 0; // a newer run stops an older one at its next frame

  constructor() {
    const material = (fragmentShader: string, uniforms: Record<string, { value: unknown }>) =>
      new THREE.ShaderMaterial({ vertexShader: quadVertexGlsl, fragmentShader, uniforms, depthTest: false, depthWrite: false });
    this.seedMaterial = material(seedGlsl, { uHeights: { value: null }, uSeaLevel: { value: 0 }, uMetersPerUnit: { value: 1 } });
    this.passMaterial = material(streamPowerGlsl, {
      uState: { value: null },
      uSize: { value: new THREE.Vector2(1, 1) },
      uCellSize: { value: new THREE.Vector2(1, 1) },
      uK: { value: 0 },
      uDiffusion: { value: 0 },
      uDt: { value: SCHOTT_DT },
      uAreaExponent: { value: SCHOTT_AREA_EXPONENT },
      uSlopeExponent: { value: SCHOTT_SLOPE_EXPONENT },
      uFlowExponent: { value: SCHOTT_FLOW_EXPONENT },
    });
    this.copyMaterial = material(copyGlsl, { uSource: { value: null } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.seedMaterial);
    this.scene.add(this.quad);
  }

  private render(renderer: THREE.WebGLRenderer, material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  private copy(renderer: THREE.WebGLRenderer, from: THREE.WebGLRenderTarget, to: THREE.WebGLRenderTarget): void {
    this.copyMaterial.uniforms.uSource.value = from.texture;
    this.render(renderer, this.copyMaterial, to);
  }

  // Runs passes in batches per frame; false if a newer run took over.
  private async runPasses(renderer: THREE.WebGLRenderer, count: number, generation: number, onProgress: (done: number) => void): Promise<boolean> {
    for (let done = 0; done < count;) {
      if (generation !== this.generation) return false;
      const batch = Math.min(PASSES_PER_FRAME, count - done);
      for (let i = 0; i < batch; i++) {
        this.passMaterial.uniforms.uState.value = this.targets[this.current].texture;
        this.render(renderer, this.passMaterial, this.targets[1 - this.current]);
        this.current = 1 - this.current;
      }
      done += batch;
      onProgress(done);
      await nextFrame();
    }
    return generation === this.generation;
  }

  private async readResult(renderer: THREE.WebGLRenderer, generation: number): Promise<DrainageResult | null> {
    const target = this.targets[this.current];
    const rgba = await readRenderTargetAsync(renderer, target);
    if (generation !== this.generation) return null;
    const cells = target.width * target.height;
    const eroded = new Float32Array(cells);
    const drainage = new Float32Array(cells);
    for (let cell = 0; cell < cells; cell++) {
      eroded[cell] = rgba[cell * 4];
      drainage[cell] = rgba[cell * 4 + 1];
    }
    const cellSize = this.passMaterial.uniforms.uCellSize.value as THREE.Vector2;
    return { eroded, drainage, cellDiagonal: cellSize.length(), metersPerUnit: this.metersPerUnit, width: target.width, height: target.height };
  }

  private async erode(renderer: THREE.WebGLRenderer, passes: number, generation: number, onProgress: (done: number) => void): Promise<DrainageResult | null> {
    this.passMaterial.uniforms.uK.value = SCHOTT_K * this.strength;
    this.passMaterial.uniforms.uDiffusion.value = Math.min(HILLSLOPE_SHARE * this.strength, MAX_HILLSLOPE_SHARE);
    const start = this.erosionPassesDone;
    const finished = await this.runPasses(renderer, passes - start, generation, (done) => {
      this.erosionPassesDone = start + done;
      onProgress(start + done);
    });
    if (!finished) return null;
    return this.readResult(renderer, generation);
  }

  // From pit-filled heights (the globe map's units, rows as given): drainage, saved, then erosionPasses on top.
  async run(renderer: THREE.WebGLRenderer, filled: Float32Array, width: number, height: number, seaLevel: number, metersPerUnit: number, radiusMeters: number, erosionPasses: number, strength: number, onProgress: (share: number) => void): Promise<DrainageResult | null> {
    const generation = ++this.generation;
    this.strength = strength;
    this.metersPerUnit = metersPerUnit;
    if (!(width > 0 && height > 0)) return null; // never draw into a target that was not made
    if (this.targets[0]?.width !== width || this.targets[0]?.height !== height) {
      this.disposeTargets();
      this.targets = [makeTarget(width, height), makeTarget(width, height)];
      this.checkpoint = makeTarget(width, height);
    }
    this.checkpointReady = false;
    const heights = new THREE.DataTexture(filled, width, height, THREE.RedFormat, THREE.FloatType);
    heights.needsUpdate = true;
    this.seedMaterial.uniforms.uHeights.value = heights;
    this.seedMaterial.uniforms.uSeaLevel.value = seaLevel;
    this.seedMaterial.uniforms.uMetersPerUnit.value = metersPerUnit;
    (this.passMaterial.uniforms.uSize.value as THREE.Vector2).set(width, height);
    (this.passMaterial.uniforms.uCellSize.value as THREE.Vector2).set((2 * Math.PI * radiusMeters) / width, (Math.PI * radiusMeters) / height);
    this.current = 0;
    this.render(renderer, this.seedMaterial, this.targets[0]);
    heights.dispose();

    const total = DRAINAGE_PASSES + erosionPasses;
    this.passMaterial.uniforms.uK.value = 0;
    this.passMaterial.uniforms.uDiffusion.value = 0;
    if (!(await this.runPasses(renderer, DRAINAGE_PASSES, generation, (done) => onProgress(done / total)))) return null;
    this.copy(renderer, this.targets[this.current], this.checkpoint!);
    this.checkpointReady = true;
    this.erosionPassesDone = 0;
    return this.erode(renderer, erosionPasses, generation, (done) => onProgress((DRAINAGE_PASSES + done) / total));
  }

  // Duration or Strength moved: continue from where the land is, or restart from the drainage-only state when Duration
  // went down or Strength changed (a different rate makes the land so far wrong).
  async setErosionPasses(renderer: THREE.WebGLRenderer, passes: number, strength: number, onProgress: (share: number) => void): Promise<DrainageResult | null> {
    if (!this.checkpointReady) return null;
    const generation = ++this.generation;
    if (passes < this.erosionPassesDone || strength !== this.strength) {
      this.strength = strength;
      this.copy(renderer, this.checkpoint!, this.targets[this.current]);
      this.erosionPassesDone = 0;
    }
    const start = this.erosionPassesDone;
    return this.erode(renderer, passes, generation, (done) => onProgress((done - start) / Math.max(1, passes - start)));
  }

  private disposeTargets(): void {
    this.targets.forEach((target) => target.dispose());
    this.targets = [];
    this.checkpoint?.dispose();
    this.checkpoint = null;
    this.checkpointReady = false;
  }

  dispose(): void {
    this.generation++;
    this.disposeTargets();
    this.seedMaterial.dispose();
    this.passMaterial.dispose();
    this.copyMaterial.dispose();
    this.quad.geometry.dispose();
  }
}
