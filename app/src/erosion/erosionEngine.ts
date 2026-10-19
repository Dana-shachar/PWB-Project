import * as THREE from 'three';
import type { ElevationReadback } from '../map/heightmap';
// Shared by every pass below — the same plain full-screen-quad pass-through
// the heightmap pipeline uses, since all of these render the same quad
// through the same ortho camera and only the fragment shader differs.
import quadVertexGlsl from '../shaders/heightmapBrush.vert.glsl?raw';
import commonGlsl from '../shaders/erosion/common.glsl?raw';
import seedGlsl from '../shaders/erosion/seed.frag.glsl?raw';
import rainGlsl from '../shaders/erosion/rain.frag.glsl?raw';
import fluxGlsl from '../shaders/erosion/flux.frag.glsl?raw';
import waterDepthGlsl from '../shaders/erosion/waterDepth.frag.glsl?raw';
import velocityGlsl from '../shaders/erosion/velocity.frag.glsl?raw';
import erodeDepositGlsl from '../shaders/erosion/erodeDeposit.frag.glsl?raw';
import transportGlsl from '../shaders/erosion/transport.frag.glsl?raw';
import evaporateGlsl from '../shaders/erosion/evaporate.frag.glsl?raw';
import copyGlsl from '../shaders/erosion/copy.frag.glsl?raw';

// Grid-based hydraulic erosion, following Mei, Decaudin and Hu's virtual
// pipes model: water and sediment live per cell and move between neighbors,
// rather than droplets running downhill. That choice is [S25] in SPEC.md,
// and the reason is the GPU: droplets need each particle to write wherever
// it lands, which WebGL handles badly, while this model is a fixed sequence
// of full-screen passes.
//
// The pass order and the state layout below were checked against two
// independent GPU implementations rather than reconstructed from the paper's
// prose. See REFERENCES.md.

// There are two clocks here and they must not be confused, which is the
// mistake this replaces.
//
// The first is the solver's own step. It is a numerical quantity, not a span
// of time anyone sees, and its only constraint is stability: the Courant
// condition says a step has to be short enough that water cannot cross a
// whole cell within it. With cells one unit across, and shallow water
// traveling at the square root of gravity times depth, that bounds the step
// at the safety factor over that speed. Derived, not picked, and it lands
// inside the range working implementations report. See REFERENCES.md.
const GRAVITY = 9.81; // matches common.glsl's own constant
const REFERENCE_DEPTH = 1; // in cells: the deepest water this model is built to hold
const CFL_SAFETY = 0.1; // the condition's own limit is 1; graphics implementations stay well under it
const SOLVER_STEP = CFL_SAFETY / Math.sqrt(GRAVITY * REFERENCE_DEPTH);

// The second clock is story time, which is what the timeline shows: days
// through to millions of years ([S26] in SPEC.md). This single conversion is
// the only place the fiction attaches to the simulation, so nothing in the
// panel is a raw step count and nothing in the shader is pretending to be a
// year.
// TODO(DS): the rate the world ages at. Dana's to set once the timeline
// exists and a run can be read against a real ruler.
export const YEARS_PER_STEP = 500;

export function stepsForYears(years: number): number {
  return Math.max(1, Math.round(years / YEARS_PER_STEP));
}

// Rounds to something readable without pretending to more precision than a
// made-up timescale has. Shared by ui/panels/ErosionPanel.tsx's own readout
// and erosion/ErosionTimeline.tsx's, rather than each file defining its own.
export function formatYears(years: number): string {
  if (years >= 1_000_000) return `${(years / 1_000_000).toFixed(1)} million years`;
  if (years >= 1000) return `${Math.round(years / 1000).toLocaleString()} thousand years`;
  return `${Math.round(years).toLocaleString()} years`;
}

// The rates a run is driven by. Named as Houdini's HeightField Erode names
// them, so water and sediment are separate real controls rather than one
// "amount" slider (Dana: "real controls over water and sediment, not a black
// box"). See REFERENCES.md.
export interface ErosionRates {
  rainfall: number; // water added per unit time
  evaporationRate: number;
  erosionRate: number; // how fast rock is lifted into the water
  depositionRate: number; // how fast carried sediment settles
  sedimentCapacity: number; // how much the water can hold, per unit slope and speed
}

export function createDefaultErosionRates(): ErosionRates {
  // The values both reference implementations start from, not ones tuned
  // against this project's own terrain. They are a starting point to adjust
  // from on the first real run, not a calibrated default.
  return {
    rainfall: 0.02,
    evaporationRate: 0.015,
    erosionRate: 0.5,
    depositionRate: 1,
    sedimentCapacity: 1,
  };
}

// Where water enters the patch. Everywhere is ordinary rainfall; a disc is
// one placed event, which is how Stage 13 gets a flood in one spot without
// its own effect. Only "everywhere" is reachable from the panel today.
export interface ErosionSource {
  mode: 'everywhere' | 'disc';
  center: THREE.Vector2; // in the patch's own uv, used by 'disc'
  radius: number;
}

// Everything a run of the engine is described by: intensity, duration,
// location and direction, so a disaster in Stage 13 is a set of values
// rather than a separate piece of code. Direction is carried but unused by
// hydraulic erosion; wind and thermal are what will read it.
export interface ErosionRun {
  intensity: number; // scales the water source
  durationYears: number; // in story time, converted to steps by stepsForYears
  location: ErosionSource;
  direction: THREE.Vector2;
  // Where the sea sits, in the same elevation units the heightmap carries.
  // Part of erosion rather than a coloring trick: ground below it starts
  // underwater, so the sea damps erosion where it is deep and sediment piles
  // up along the coast instead of running off the edge.
  seaLevel: number;
  rates: ErosionRates;
}

// What one press of Run produced. The measurements are not decoration: with
// only a button and a mesh there is no way to tell a run that did nothing
// from a run that did something too small to see.
export interface ErosionOutcome {
  elevation: ElevationReadback;
  steps: number;
  years: number;
  gridResolution: number;
  meanChange: number; // mean absolute change, in elevation units
  maxChange: number;
  elapsedMs: number;
  // What scrubbing needs to resume mid-run rather than only replay from the
  // very start: the periodic snapshots taken along the way, the exact run
  // they were taken under (rates can't drift between the run and a later
  // scrub), and the same raw-to-elevation-units conversion the run itself
  // used. See erosion/erosionControls.ts's scrubTo().
  checkpoints: ErosionCheckpoint[];
  run: ErosionRun;
  heightToCells: number;
}

type PassName = 'seed' | 'rain' | 'flux' | 'waterDepth' | 'velocity' | 'erodeDeposit' | 'transport' | 'evaporate';

// A complete snapshot of the simulation at one step — all three state
// textures, not just elevation, since resuming a run needs water, sediment
// and flux back too, not only the terrain. What the timeline scrubs
// between: periodic, not every step (one of these is already ~3MB at a 257
// grid), the rolling window [S27] calls for. See erosion/erosionControls.ts
// for how many of these are kept and when they're dropped.
export interface ErosionCheckpoint {
  step: number;
  size: number;
  height: Float32Array; // RGBA — terrain/water/sediment/mean-depth, raw GPU layout
  flux: Float32Array; // RGBA — the four outflow amounts
  velocity: Float32Array; // RGBA — RG used
}

// Bytes one checkpoint at this grid size costs — three RGBA float textures.
// Exported so callers (erosionControls.ts) can size a checkpoint budget
// without duplicating the arithmetic.
export function estimateCheckpointBytes(size: number): number {
  return size * size * 4 * 4 * 3; // width * height * 4 channels * 4 bytes/float * 3 textures
}

// The simulation's whole state, in three textures:
//
// - height: terrain in R, water depth in G, suspended sediment in B, and the
//   step's mean water depth in A (written by the water pass, read by the
//   velocity pass).
// - flux: the four outflow amounts, left/right/up/down in R/G/B/A.
// - velocity: the flow velocity's two components in R/G.
//
// Height and flux are ping-pong pairs, since each pass reads the whole
// neighborhood and so cannot write into what it is reading.
//
// Every pass writes exactly one target, which is why there are seven of them
// rather than the paper's five steps: splitting the one step that produces
// both a depth and a velocity keeps all of this in the same GLSL dialect as
// the rest of the project, instead of moving the erosion shaders alone to the
// newer one for the sake of multiple outputs.
export class ErosionEngine {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private quad: THREE.Mesh;
  private materials: Record<PassName, THREE.ShaderMaterial>;
  // Not a simulation pass — the plain blit loadCheckpoint() uses to get a
  // saved buffer back onto the GPU. See shaders/erosion/copy.frag.glsl.
  private copyMaterial: THREE.ShaderMaterial;
  private heightTargets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | null = null;
  private fluxTargets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | null = null;
  private velocityTarget: THREE.WebGLRenderTarget | null = null;
  private heightIndex = 0;
  private fluxIndex = 0;
  private size = 0;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.materials = {
      seed: this.makeMaterial(seedGlsl, {
        uElevation: { value: null },
        uHeightToCells: { value: 1 },
        uSeaLevel: { value: 0 },
      }),
      rain: this.makeMaterial(rainGlsl, {
        uHeightState: { value: null },
        uRainfall: { value: 0 },
        uSourceMode: { value: 0 },
        uSourceCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uSourceRadius: { value: 0.25 },
      }),
      flux: this.makeMaterial(fluxGlsl, {
        uHeightState: { value: null },
        uFluxState: { value: null },
        uTexel: { value: 1 },
        uSeaLevel: { value: 0 },
      }),
      waterDepth: this.makeMaterial(waterDepthGlsl, {
        uHeightState: { value: null },
        uFluxState: { value: null },
        uTexel: { value: 1 },
      }),
      velocity: this.makeMaterial(velocityGlsl, {
        uHeightState: { value: null },
        uFluxState: { value: null },
        uTexel: { value: 1 },
      }),
      erodeDeposit: this.makeMaterial(erodeDepositGlsl, {
        uHeightState: { value: null },
        uVelocity: { value: null },
        uTexel: { value: 1 },
        uSedimentCapacity: { value: 1 },
        uErosionRate: { value: 0 },
        uDepositionRate: { value: 0 },
      }),
      transport: this.makeMaterial(transportGlsl, {
        uHeightState: { value: null },
        uVelocity: { value: null },
        uTexel: { value: 1 },
      }),
      evaporate: this.makeMaterial(evaporateGlsl, {
        uHeightState: { value: null },
        uEvaporationRate: { value: 0 },
      }),
    };
    this.copyMaterial = this.makeMaterial(copyGlsl, { uSource: { value: null } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.materials.seed);
    this.scene.add(this.quad);
  }

  private makeMaterial(fragmentShader: string, uniforms: Record<string, { value: unknown }>): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: quadVertexGlsl,
      fragmentShader: commonGlsl + fragmentShader,
      // uDeltaTime is on every pass whether or not it reads it, so the one
      // solver step can never be set on some passes and missed on others.
      uniforms: { ...uniforms, uDeltaTime: { value: SOLVER_STEP } },
      depthTest: false,
      depthWrite: false,
    });
  }

  // FloatType because terrain height here is real unclamped elevation, same
  // reason the heightmap's own targets are float (see map/heightmap.ts), and
  // because water and sediment go far below what a byte can hold.
  // NearestFilter because every read in these passes is a deliberate single
  // cell, and the one place a blend is wanted does its own (see
  // transport.frag.glsl).
  private makeTarget(size: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(size, size, {
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
    });
  }

  private disposeTargets(): void {
    this.heightTargets?.forEach((target) => target.dispose());
    this.fluxTargets?.forEach((target) => target.dispose());
    this.velocityTarget?.dispose();
    this.heightTargets = null;
    this.fluxTargets = null;
    this.velocityTarget = null;
  }

  private renderPass(renderer: THREE.WebGLRenderer, material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  private heightTexture(): THREE.Texture {
    return this.heightTargets![this.heightIndex].texture;
  }

  private fluxTexture(): THREE.Texture {
    return this.fluxTargets![this.fluxIndex].texture;
  }

  // One pass that reads the height state and writes the next one. Each such
  // pass carries the three channels it does not change through untouched, so
  // they can run in any order without losing state.
  private stepHeight(renderer: THREE.WebGLRenderer, material: THREE.ShaderMaterial): void {
    material.uniforms.uHeightState.value = this.heightTexture();
    const next = this.heightTargets![1 - this.heightIndex];
    this.renderPass(renderer, material, next);
    this.heightIndex = 1 - this.heightIndex;
  }

  // Loads a freshly baked patch and resets the water, sediment and flux to
  // nothing. A run always starts here rather than continuing from whatever
  // the last one left, so the same inputs give the same result.
  seed(renderer: THREE.WebGLRenderer, elevation: THREE.WebGLRenderTarget, heightToCells: number, seaLevel: number): void {
    const size = elevation.width;
    if (size !== this.size) {
      this.disposeTargets();
      this.heightTargets = [this.makeTarget(size), this.makeTarget(size)];
      this.fluxTargets = [this.makeTarget(size), this.makeTarget(size)];
      this.velocityTarget = this.makeTarget(size);
      this.size = size;
    }
    this.heightIndex = 0;
    this.fluxIndex = 0;
    [this.fluxTargets![0], this.fluxTargets![1], this.velocityTarget!].forEach((target) => {
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.setRenderTarget(null);
    });

    const seedMaterial = this.materials.seed;
    seedMaterial.uniforms.uElevation.value = elevation.texture;
    seedMaterial.uniforms.uHeightToCells.value = heightToCells;
    // Converted into cell units here so every shader works in one set of
    // units and only this boundary knows about elevation units.
    seedMaterial.uniforms.uSeaLevel.value = seaLevel * heightToCells;
    this.materials.flux.uniforms.uSeaLevel.value = seaLevel * heightToCells;
    this.renderPass(renderer, seedMaterial, this.heightTargets![0]);
  }

  // One step of the simulation: the seven passes, in this order. Nothing
  // lives outside the three state textures, which is what will let the
  // timeline snapshot a step and replay from it (see [S27] in SPEC.md).
  step(renderer: THREE.WebGLRenderer, run: ErosionRun): void {
    if (!this.heightTargets || !this.fluxTargets || !this.velocityTarget) return;
    const { rates } = run;
    const texel = 1 / this.size;

    const rain = this.materials.rain;
    rain.uniforms.uRainfall.value = rates.rainfall * run.intensity;
    rain.uniforms.uSourceMode.value = run.location.mode === 'disc' ? 1 : 0;
    (rain.uniforms.uSourceCenter.value as THREE.Vector2).copy(run.location.center);
    rain.uniforms.uSourceRadius.value = run.location.radius;
    this.stepHeight(renderer, rain);

    const flux = this.materials.flux;
    flux.uniforms.uHeightState.value = this.heightTexture();
    flux.uniforms.uFluxState.value = this.fluxTexture();
    flux.uniforms.uTexel.value = texel;
    this.renderPass(renderer, flux, this.fluxTargets[1 - this.fluxIndex]);
    this.fluxIndex = 1 - this.fluxIndex;

    const waterDepth = this.materials.waterDepth;
    waterDepth.uniforms.uFluxState.value = this.fluxTexture();
    waterDepth.uniforms.uTexel.value = texel;
    this.stepHeight(renderer, waterDepth);

    const velocity = this.materials.velocity;
    velocity.uniforms.uHeightState.value = this.heightTexture();
    velocity.uniforms.uFluxState.value = this.fluxTexture();
    velocity.uniforms.uTexel.value = texel;
    this.renderPass(renderer, velocity, this.velocityTarget);

    const erodeDeposit = this.materials.erodeDeposit;
    erodeDeposit.uniforms.uVelocity.value = this.velocityTarget.texture;
    erodeDeposit.uniforms.uTexel.value = texel;
    erodeDeposit.uniforms.uSedimentCapacity.value = rates.sedimentCapacity;
    erodeDeposit.uniforms.uErosionRate.value = rates.erosionRate;
    erodeDeposit.uniforms.uDepositionRate.value = rates.depositionRate;
    this.stepHeight(renderer, erodeDeposit);

    const transport = this.materials.transport;
    transport.uniforms.uVelocity.value = this.velocityTarget.texture;
    transport.uniforms.uTexel.value = texel;
    this.stepHeight(renderer, transport);

    const evaporate = this.materials.evaporate;
    evaporate.uniforms.uEvaporationRate.value = rates.evaporationRate;
    this.stepHeight(renderer, evaporate);
  }

  // Uploads a saved buffer back onto the GPU — a DataTexture is CPU data
  // plus a description, not something the GPU can read from directly, so a
  // copy pass blits it into the real render target. See copy.frag.glsl.
  private uploadToTarget(renderer: THREE.WebGLRenderer, data: Float32Array, size: number, target: THREE.WebGLRenderTarget): void {
    const dataTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    dataTexture.needsUpdate = true;
    this.copyMaterial.uniforms.uSource.value = dataTexture;
    this.renderPass(renderer, this.copyMaterial, target);
    dataTexture.dispose();
  }

  // All three state textures, read back whole — not just elevation, since
  // resuming needs water, sediment and flux too. See ErosionCheckpoint.
  captureCheckpoint(renderer: THREE.WebGLRenderer, step: number): ErosionCheckpoint | null {
    if (!this.heightTargets || !this.fluxTargets || !this.velocityTarget) return null;
    const size = this.size;
    const height = new Float32Array(size * size * 4);
    renderer.readRenderTargetPixels(this.heightTargets[this.heightIndex], 0, 0, size, size, height);
    const flux = new Float32Array(size * size * 4);
    renderer.readRenderTargetPixels(this.fluxTargets[this.fluxIndex], 0, 0, size, size, flux);
    const velocity = new Float32Array(size * size * 4);
    renderer.readRenderTargetPixels(this.velocityTarget, 0, 0, size, size, velocity);
    return { step, size, height, flux, velocity };
  }

  // Resumes from a checkpoint — step() can continue from here exactly as it
  // would have from seed(), since both leave the same three state textures
  // behind. Always restores into index 0 of each ping-pong pair, same
  // convention seed() uses, so there is one "state just loaded" shape
  // regardless of which half of the pair it came from originally.
  loadCheckpoint(renderer: THREE.WebGLRenderer, checkpoint: ErosionCheckpoint): void {
    if (!this.heightTargets || !this.fluxTargets || !this.velocityTarget || checkpoint.size !== this.size) return;
    this.uploadToTarget(renderer, checkpoint.height, checkpoint.size, this.heightTargets[0]);
    this.heightIndex = 0;
    this.uploadToTarget(renderer, checkpoint.flux, checkpoint.size, this.fluxTargets[0]);
    this.fluxIndex = 0;
    this.uploadToTarget(renderer, checkpoint.velocity, checkpoint.size, this.velocityTarget);
  }

  // The eroded terrain, back in the elevation units the patch was baked in,
  // and in the same shape and orientation getRegionElevationData returns so
  // the land chunk consumes it with no idea which of the two it got.
  readElevation(renderer: THREE.WebGLRenderer, heightToCells: number): ElevationReadback | null {
    if (!this.heightTargets) return null;
    const size = this.size;
    const rgba = new Float32Array(size * size * 4);
    renderer.readRenderTargetPixels(this.heightTargets[this.heightIndex], 0, 0, size, size, rgba);
    // Same bottom-to-top to top-to-bottom row flip every other readback in
    // this project does, so callers never have to know which one they got.
    const elevation = new Float32Array(size * size);
    for (let row = 0; row < size; row++) {
      const srcRowStart = row * size * 4;
      const destRowStart = (size - 1 - row) * size;
      for (let col = 0; col < size; col++) {
        elevation[destRowStart + col] = rgba[srcRowStart + col * 4] / heightToCells; // R, back out of cell units
      }
    }
    return { data: elevation, width: size, height: size };
  }

  dispose(): void {
    this.disposeTargets();
    Object.values(this.materials).forEach((material) => material.dispose());
    this.copyMaterial.dispose();
    this.scene.remove(this.quad);
    this.quad.geometry.dispose();
    this.size = 0;
  }
}
