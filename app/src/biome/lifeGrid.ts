import * as THREE from 'three';
import quadVertexGlsl from '../shaders/heightmap/heightmapBrush.vert.glsl?raw';
import terrainGlsl from '../shaders/terrain/terrain.glsl?raw';
import inputsGlsl from '../shaders/biome/lifeInputs.frag.glsl?raw';
import stepGlsl from '../shaders/biome/lifeStep.frag.glsl?raw';
import sumGlsl from '../shaders/biome/lifeSum.frag.glsl?raw';
import shoreGlsl from '../shaders/biome/lifeShore.frag.glsl?raw';
import { BASE_GENOME, geneOffset, ERA_YEARS, LIFE_VARIANTS, MAX_ERAS, mutate, rangeVector, seededRandom, type BiomeSettings, type Genome } from './plantTypes';
import { readRenderTargetAsync } from '../map/heightmap';

// The life grid on the land chunk (Cordonnier et al. 2017): a cell grid stepped on the GPU like erosion, never individual
// plants. Rebuilt from bare ground on any change, as erosion is replayed; nothing is saved but the settings.
export const LIFE_GRID_SIZE = 512;
const MAX_STEPS = 400; // a longer span takes bigger steps, toward the settled state
const STEPS_PER_FRAME = 40;
const SUM_BLOCK = 16; // lifeSum.frag.glsl's loop size: each type sums to 32 by 32 before an era reads it

export interface LifeInputs {
  heightMap: THREE.Texture;
  heightMapGreenChannel: boolean;
  heightMapSize: number;
  lakeLevels: THREE.Texture;
  seaLevel: number;
  maxHeight: number;
  chunkSize: number;
  temperature: number;
  peakCooling: number;
  elevationMin: number;
  elevationMax: number;
  poleCooling: number;
  latitude: number;
  rainShare: number;
  sunDirection: THREE.Vector3;
  shadowsEnabled: boolean;
}

function makeTarget(size = LIFE_GRID_SIZE, filter: THREE.MagnificationTextureFilter = THREE.LinearFilter, height = size): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(size, height, {
    type: THREE.FloatType,
    minFilter: filter,
    magFilter: filter,
    depthBuffer: false,
  });
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export class LifeGrid {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private inputsMaterial: THREE.ShaderMaterial;
  private stepMaterial: THREE.ShaderMaterial;
  private inputsTarget = makeTarget();
  private sumMaterial: THREE.ShaderMaterial;
  private sumTarget = makeTarget((LIFE_GRID_SIZE / SUM_BLOCK) * 2, THREE.LinearFilter, LIFE_GRID_SIZE / SUM_BLOCK); // algae | moss
  // Distance to the nearest water (lifeShore.frag.glsl): two exact-read targets for the jump flooding, one smooth for
  // the result.
  private shoreMaterial: THREE.ShaderMaterial;
  private jumpTargets = [makeTarget(LIFE_GRID_SIZE, THREE.NearestFilter), makeTarget(LIFE_GRID_SIZE, THREE.NearestFilter)];
  private shoreTarget = makeTarget();
  private stepYears = 1; // the run's step and era lengths
  private eraYears = ERA_YEARS;
  // Three sets of targets (algae variants, moss variants, soil; lifeStep.frag.glsl): one shown, two a run ping-pongs
  // between out of sight, so only finished results reach the screen (double buffering).
  private states = [0, 1, 2].map(() => [makeTarget(), makeTarget(), makeTarget()]);
  private shown = 2;
  private work: [number, number] = [0, 1];
  private cleared = false; // all sets start from bare ground once
  // The shown result's genes, per type (chunk.frag.glsl colors), and the running ones.
  genomes: { algae: Genome[]; moss: Genome[] } = { algae: Array(LIFE_VARIANTS).fill(BASE_GENOME), moss: Array(LIFE_VARIANTS).fill(BASE_GENOME) };
  private working: { algae: Genome[]; moss: Genome[] } = this.genomes;
  private current = 0;
  private generation = 0; // a newer run stops an older one at its next frame

  constructor() {
    const material = (fragmentShader: string, uniforms: Record<string, { value: unknown }>) =>
      new THREE.ShaderMaterial({ vertexShader: quadVertexGlsl, fragmentShader, uniforms, depthTest: false, depthWrite: false });
    this.inputsMaterial = material(terrainGlsl + '\n' + inputsGlsl, {
      uHeightMap: { value: null },
      uHeightMapGreenChannel: { value: 0 },
      uHeightTexel: { value: 1 / 512 },
      uChunkLakeLevels: { value: null },
      uSeaLevel: { value: 0 },
      uMaxHeight: { value: 1 },
      uChunkSize: { value: 1 },
      uTemperature: { value: 15 },
      uPeakCooling: { value: 40 },
      uElevationMin: { value: 0 },
      uElevationMax: { value: 1 },
      uPoleCooling: { value: 30 },
      uLatitude: { value: 0 },
      uRainShare: { value: 0.5 },
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
      uShadowsEnabled: { value: 1 },
    });
    this.stepMaterial = material(stepGlsl, {
      uAlgae: { value: null },
      uMoss: { value: null },
      uSoil: { value: null },
      uAlgaeMoistureShift: { value: new THREE.Vector4() },
      uAlgaeShadeShift: { value: new THREE.Vector4() },
      uMossMoistureShift: { value: new THREE.Vector4() },
      uMossShadeShift: { value: new THREE.Vector4() },
      uOutput: { value: 0 },
      uShore: { value: this.shoreTarget.texture },
      uShoreReach: { value: 200 },
      uMetersPerUv: { value: 16000 },
      uAlgaeCleared: { value: new THREE.Vector4() },
      uMossCleared: { value: new THREE.Vector4() },
      uInputs: { value: this.inputsTarget.texture },
      uAlgaeTemperature: { value: new THREE.Vector4() },
      uAlgaeMoisture: { value: new THREE.Vector4() },
      uAlgaeSun: { value: new THREE.Vector4() },
      uMossTemperature: { value: new THREE.Vector4() },
      uMossMoisture: { value: new THREE.Vector4() },
      uMossSun: { value: new THREE.Vector4() },
      uGrowthRate: { value: 0.05 },
      uDeathRate: { value: 0.2 },
      uYears: { value: 1 },
    });
    this.sumMaterial = material(sumGlsl, {
      uAlgae: { value: null },
      uMoss: { value: null },
      uSourceSize: { value: LIFE_GRID_SIZE },
      uBlock: { value: SUM_BLOCK },
    });
    this.shoreMaterial = material(shoreGlsl, {
      uSource: { value: null },
      uMode: { value: 0 },
      uStep: { value: 1 },
      uGridSize: { value: LIFE_GRID_SIZE },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.stepMaterial);
    this.scene.add(this.quad);
  }

  // The last finished state: each type's four variant amounts (RGBA).
  get algae(): THREE.Texture {
    return this.states[this.shown][0].texture;
  }
  get moss(): THREE.Texture {
    return this.states[this.shown][1].texture;
  }

  // Distance to the nearest water (R, in grid UV), baked with the inputs.
  get shore(): THREE.Texture {
    return this.shoreTarget.texture;
  }

  // The inputs, baked once per change: temperature, moisture, sunlight, hollowness (lifeInputs.frag.glsl).
  get inputs(): THREE.Texture {
    return this.inputsTarget.texture;
  }

  private render(renderer: THREE.WebGLRenderer, material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.clear(); // the shared renderer has autoClear off
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  // Grows life from bare ground for the settings' years. Resolves false if a newer run took over.
  // onProgress: the share of steps done, null once finished.
  async run(renderer: THREE.WebGLRenderer, inputs: LifeInputs, settings: BiomeSettings, onFrame: () => void, onProgress: (share: number | null) => void): Promise<boolean> {
    const generation = ++this.generation;
    const u = this.inputsMaterial.uniforms;
    u.uHeightMap.value = inputs.heightMap;
    u.uHeightMapGreenChannel.value = inputs.heightMapGreenChannel ? 1 : 0;
    u.uHeightTexel.value = 1 / Math.max(1, inputs.heightMapSize);
    u.uChunkLakeLevels.value = inputs.lakeLevels;
    u.uSeaLevel.value = inputs.seaLevel;
    u.uMaxHeight.value = inputs.maxHeight;
    u.uChunkSize.value = inputs.chunkSize;
    u.uTemperature.value = inputs.temperature;
    u.uPeakCooling.value = inputs.peakCooling;
    u.uElevationMin.value = inputs.elevationMin;
    u.uElevationMax.value = inputs.elevationMax;
    u.uPoleCooling.value = inputs.poleCooling;
    u.uLatitude.value = inputs.latitude;
    u.uRainShare.value = inputs.rainShare;
    (u.uSunDirection.value as THREE.Vector3).copy(inputs.sunDirection);
    u.uShadowsEnabled.value = inputs.shadowsEnabled ? 1 : 0;
    this.render(renderer, this.inputsMaterial, this.inputsTarget);
    // Jump flooding: seed the water cells, then passes at 256, 128, ... 1 cells, then the distance.
    const shore = this.shoreMaterial.uniforms;
    shore.uSource.value = this.inputsTarget.texture;
    shore.uMode.value = 0;
    this.render(renderer, this.shoreMaterial, this.jumpTargets[0]);
    let jump = 0;
    shore.uMode.value = 1;
    for (let step = LIFE_GRID_SIZE / 2; step >= 1; step /= 2) {
      shore.uSource.value = this.jumpTargets[jump].texture;
      shore.uStep.value = step;
      this.render(renderer, this.shoreMaterial, this.jumpTargets[1 - jump]);
      jump = 1 - jump;
    }
    shore.uSource.value = this.jumpTargets[jump].texture;
    shore.uMode.value = 2;
    this.render(renderer, this.shoreMaterial, this.shoreTarget);

    const s = this.stepMaterial.uniforms;
    (s.uAlgaeTemperature.value as THREE.Vector4).set(...rangeVector(settings.algae.temperature));
    (s.uAlgaeMoisture.value as THREE.Vector4).set(...rangeVector(settings.algae.moisture));
    (s.uAlgaeSun.value as THREE.Vector4).set(...rangeVector(settings.algae.sun));
    (s.uMossTemperature.value as THREE.Vector4).set(...rangeVector(settings.moss.temperature));
    (s.uMossMoisture.value as THREE.Vector4).set(...rangeVector(settings.moss.moisture));
    (s.uMossSun.value as THREE.Vector4).set(...rangeVector(settings.moss.sun));
    s.uGrowthRate.value = settings.growthRate;
    s.uDeathRate.value = settings.deathRate;
    s.uShoreReach.value = settings.shoreReach;
    s.uMetersPerUv.value = inputs.chunkSize * 1000;

    // Bare ground, then one step a year, or bigger steps on a long span.
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    this.work = [0, 1, 2].filter((index) => index !== this.shown) as [number, number];
    this.current = this.work[0];
    const toClear = this.cleared ? this.work.map((index) => this.states[index]) : this.states;
    this.cleared = true;
    for (const set of toClear) {
      for (const target of set) {
        renderer.setRenderTarget(target);
        renderer.clear();
      }
    }
    renderer.setRenderTarget(null);
    renderer.setClearColor(clearColor, clearAlpha);
    const steps = Math.min(Math.max(0, Math.round(settings.years)), MAX_STEPS);
    const stepYears = steps > 0 ? settings.years / steps : 0;
    s.uYears.value = stepYears;

    // Evolution: four variants per type, mutants of the type's own settings; seeded, so a rerun replays the same history.
    const random = seededRandom(settings.seed);
    const founders = () => settings.evolve ? [BASE_GENOME, ...Array.from({ length: LIFE_VARIANTS - 1 }, () => mutate(BASE_GENOME, random, settings.mutationRate))] : Array<Genome>(LIFE_VARIANTS).fill(BASE_GENOME);
    this.working = { algae: founders(), moss: founders() };
    this.stepYears = stepYears;
    // An era every ERA_YEARS, longer on a long span so there are at most MAX_ERAS.
    this.eraYears = Math.max(ERA_YEARS, settings.years / MAX_ERAS);
    onProgress(0);
    return this.simulate(renderer, settings, steps, random, generation, onFrame, onProgress);
  }

  private applyGenes(): void {
    const s = this.stepMaterial.uniforms;
    const genes = (list: Genome[], gene: 'moistureShift' | 'shadeShift') => list.map((genome) => geneOffset(genome, gene, 1)) as [number, number, number, number];
    (s.uAlgaeMoistureShift.value as THREE.Vector4).set(...genes(this.working.algae, 'moistureShift'));
    (s.uAlgaeShadeShift.value as THREE.Vector4).set(...genes(this.working.algae, 'shadeShift'));
    (s.uMossMoistureShift.value as THREE.Vector4).set(...genes(this.working.moss, 'moistureShift'));
    (s.uMossShadeShift.value as THREE.Vector4).set(...genes(this.working.moss, 'shadeShift'));
  }

  // One era: per type, the least abundant variant is replaced by a mutant of the most abundant (Sims 1991; JeDi-DGVM's
  // competition decides abundance). Both types are summed on the GPU into one small grid, read back in a single wait.
  private async newEra(renderer: THREE.WebGLRenderer, settings: BiomeSettings, random: () => number, generation: number): Promise<boolean> {
    this.sumMaterial.uniforms.uAlgae.value = this.states[this.current][0].texture;
    this.sumMaterial.uniforms.uMoss.value = this.states[this.current][1].texture;
    this.render(renderer, this.sumMaterial, this.sumTarget);
    const values = await readRenderTargetAsync(renderer, this.sumTarget);
    if (generation !== this.generation) return false;
    const width = this.sumTarget.width;
    for (const [type, half] of [['algae', 0], ['moss', 1]] as const) {
      const totals = [0, 0, 0, 0];
      for (let k = 0; k < values.length; k += 4) {
        const column = (k / 4) % width;
        if ((column < width / 2 ? 0 : 1) !== half) continue;
        for (let v = 0; v < 4; v++) totals[v] += values[k + v];
      }
      const strongest = totals.indexOf(Math.max(...totals));
      const weakest = totals.indexOf(Math.min(...totals));
      if (strongest !== weakest) {
        this.working[type][weakest] = mutate(this.working[type][strongest], random, settings.mutationRate);
        (this.stepMaterial.uniforms[type === 'algae' ? 'uAlgaeCleared' : 'uMossCleared'].value as THREE.Vector4).setComponent(weakest, 1);
      }
    }
    this.applyGenes();
    return true;
  }

  // Steps the grid on from its current state, a batch per frame, with an era every eraYears.
  private async simulate(renderer: THREE.WebGLRenderer, settings: BiomeSettings, steps: number, random: () => number, generation: number, onFrame: () => void, onProgress: (share: number | null) => void): Promise<boolean> {
    const s = this.stepMaterial.uniforms;
    s.uYears.value = this.stepYears;
    this.applyGenes();
    let nextEra = this.eraYears;
    let year = 0;
    for (let done = 0; done < steps; ) {
      if (generation !== this.generation) return false;
      const batch = Math.min(STEPS_PER_FRAME, steps - done);
      for (let i = 0; i < batch; i++) {
        const next = this.current === this.work[0] ? this.work[1] : this.work[0];
        const from = this.states[this.current];
        const to = this.states[next];
        s.uAlgae.value = from[0].texture;
        s.uMoss.value = from[1].texture;
        s.uSoil.value = from[2].texture;
        for (let output = 0; output < 3; output++) {
          s.uOutput.value = output;
          this.render(renderer, this.stepMaterial, to[output]);
        }
        this.current = next;
        // A replaced variant's cover is cleared by the step that read it; later steps keep the mutant's own growth.
        (s.uAlgaeCleared.value as THREE.Vector4).set(0, 0, 0, 0);
        (s.uMossCleared.value as THREE.Vector4).set(0, 0, 0, 0);
        year += this.stepYears;
        if (settings.evolve && year >= nextEra) {
          nextEra += this.eraYears;
          if (!(await this.newEra(renderer, settings, random, generation))) return false;
        }
      }
      done += batch;
      onProgress(done / steps);
      if (done < steps) await nextFrame();
    }
    if (generation !== this.generation) return false;
    // Finished: this run's result and genes go on screen together.
    this.shown = this.current;
    this.genomes = this.working;
    onFrame();
    onProgress(null);
    return true;
  }

  dispose(): void {
    this.inputsTarget.dispose();
    this.sumTarget.dispose();
    this.shoreMaterial.dispose();
    this.shoreTarget.dispose();
    for (const target of this.jumpTargets) target.dispose();
    this.sumMaterial.dispose();
    for (const set of this.states) for (const target of set) target.dispose();
    this.inputsMaterial.dispose();
    this.stepMaterial.dispose();
  }
}
