import * as THREE from 'three';
import quadVertexGlsl from '../shaders/heightmap/heightmapBrush.vert.glsl?raw';
import terrainGlsl from '../shaders/terrain/terrain.glsl?raw';
import inputsGlsl from '../shaders/biome/lifeInputs.frag.glsl?raw';
import stepGlsl from '../shaders/biome/lifeStep.frag.glsl?raw';
import { rangeVector, type BiomeSettings } from './plantTypes';

// The life grid on the land chunk (Cordonnier et al. 2017): a cell grid stepped on the GPU like erosion, never individual
// plants. Rebuilt from bare ground on any change, as erosion is replayed; nothing is saved but the settings.
export const LIFE_GRID_SIZE = 512;
const MAX_STEPS = 400; // a longer span takes bigger steps, toward the settled state
const STEPS_PER_FRAME = 40;

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

function makeTarget(): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(LIFE_GRID_SIZE, LIFE_GRID_SIZE, {
    type: THREE.FloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
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
  private states = [makeTarget(), makeTarget()];
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
      uState: { value: null },
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
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.stepMaterial);
    this.scene.add(this.quad);
  }

  // The current state: R algae, G moss, B humus, A last step's dead matter.
  get texture(): THREE.Texture {
    return this.states[this.current].texture;
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
  async run(renderer: THREE.WebGLRenderer, inputs: LifeInputs, settings: BiomeSettings, onFrame: () => void): Promise<boolean> {
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

    const s = this.stepMaterial.uniforms;
    (s.uAlgaeTemperature.value as THREE.Vector4).set(...rangeVector(settings.algae.temperature));
    (s.uAlgaeMoisture.value as THREE.Vector4).set(...rangeVector(settings.algae.moisture));
    (s.uAlgaeSun.value as THREE.Vector4).set(...rangeVector(settings.algae.sun));
    (s.uMossTemperature.value as THREE.Vector4).set(...rangeVector(settings.moss.temperature));
    (s.uMossMoisture.value as THREE.Vector4).set(...rangeVector(settings.moss.moisture));
    (s.uMossSun.value as THREE.Vector4).set(...rangeVector(settings.moss.sun));
    s.uGrowthRate.value = settings.growthRate;
    s.uDeathRate.value = settings.deathRate;

    // Bare ground, then one step a year, or bigger steps on a long span.
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const target of this.states) {
      renderer.setRenderTarget(target);
      renderer.clear();
    }
    renderer.setRenderTarget(null);
    renderer.setClearColor(clearColor, clearAlpha);
    const steps = Math.min(Math.max(0, Math.round(settings.years)), MAX_STEPS);
    s.uYears.value = steps > 0 ? settings.years / steps : 0;
    for (let done = 0; done < steps; ) {
      if (generation !== this.generation) return false;
      const batch = Math.min(STEPS_PER_FRAME, steps - done);
      for (let i = 0; i < batch; i++) {
        s.uState.value = this.states[this.current].texture;
        this.render(renderer, this.stepMaterial, this.states[1 - this.current]);
        this.current = 1 - this.current;
      }
      done += batch;
      onFrame();
      if (done < steps) await nextFrame();
    }
    onFrame();
    return generation === this.generation;
  }

  dispose(): void {
    this.inputsTarget.dispose();
    for (const target of this.states) target.dispose();
    this.inputsMaterial.dispose();
    this.stepMaterial.dispose();
  }
}
