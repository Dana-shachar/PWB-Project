import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import colorGradeFrag from '../shaders/post/colorGrade.frag.glsl?raw';

// The per-planet color grade, a post pass as engines run it (Unity's Volume, Unreal's Post Process Volume, Godot's
// Environment adjustments). Lift, gamma and gain follow Unity URP's math; split toning is Unity's too.
export interface GradeWheel {
  color: string; // the tint; white is none
  amount: number; // -1 to 1, Unity's trackball slider
}

export interface SplitToning {
  hue: number; // the highlights' hue, degrees -180 to 180
  shadowOffset: number; // the shadows' hue, degrees from the highlights'
  strength: number; // 0 is none, 1 the purest tint
  balance: number; // -1 to 1: where shadows end and highlights begin
}

export interface ColorGradeSettings {
  enabled: boolean;
  lift: GradeWheel;
  gamma: GradeWheel;
  gain: GradeWheel;
  saturation: number; // 1 is none
  split: SplitToning;
}

// Neutral: the frame passes through unchanged.
export const DEFAULT_COLOR_GRADE: ColorGradeSettings = {
  enabled: true,
  lift: { color: '#ffffff', amount: 0 },
  gamma: { color: '#ffffff', amount: 0 },
  gain: { color: '#ffffff', amount: 0 },
  saturation: 1,
  split: { hue: 30, shadowOffset: 180, strength: 0, balance: 0 },
};

export function migrateColorGrade(saved: Partial<ColorGradeSettings> | undefined): ColorGradeSettings {
  return { ...DEFAULT_COLOR_GRADE, ...saved, split: { ...DEFAULT_COLOR_GRADE.split, ...saved?.split } };
}

const luminance = (color: THREE.Color) => color.r * 0.2126729 + color.g * 0.7151522 + color.b * 0.072175;

// Unity's ColorUtils.PrepareLiftGammaGain: each tint is scaled, its own brightness removed (so it only tints), and the
// amount added back. THREE.Color holds linear values, Unity's GammaToLinearSpace.
export function prepareLiftGammaGain(lift: GradeWheel, gamma: GradeWheel, gain: GradeWheel): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const liftColor = new THREE.Color(lift.color).multiplyScalar(0.15);
  const liftLuma = luminance(liftColor);
  const liftOut = new THREE.Vector3(liftColor.r, liftColor.g, liftColor.b).subScalar(liftLuma).addScalar(lift.amount);

  const gammaColor = new THREE.Color(gamma.color).multiplyScalar(0.8);
  const gammaLuma = luminance(gammaColor);
  const gammaW = gamma.amount + 1;
  const gammaOut = new THREE.Vector3(
    1 / Math.max(gammaColor.r - gammaLuma + gammaW, 1e-3),
    1 / Math.max(gammaColor.g - gammaLuma + gammaW, 1e-3),
    1 / Math.max(gammaColor.b - gammaLuma + gammaW, 1e-3),
  );

  const gainColor = new THREE.Color(gain.color).multiplyScalar(0.8);
  const gainLuma = luminance(gainColor);
  const gainOut = new THREE.Vector3(gainColor.r, gainColor.g, gainColor.b).subScalar(gainLuma).addScalar(gain.amount + 1);
  return [liftOut, gammaOut, gainOut];
}

// A split-toning tint as Unity's shader takes it: gamma-space color, mid gray (0.5) when strength is 0.
export function splitTint(hue: number, strength: number): THREE.Vector3 {
  const color = new THREE.Color().setHSL((((hue % 360) + 360) % 360) / 360, strength, 0.5, THREE.SRGBColorSpace);
  const srgb = { r: 0, g: 0, b: 0 };
  color.getRGB(srgb, THREE.SRGBColorSpace);
  return new THREE.Vector3(srgb.r, srgb.g, srgb.b);
}

// A split-toning tint as a CSS color, for the hue bar's swatches.
export function splitSwatch(hue: number, strength: number): string {
  const tint = splitTint(hue, strength);
  return `rgb(${Math.round(tint.x * 255)}, ${Math.round(tint.y * 255)}, ${Math.round(tint.z * 255)})`;
}

// The Split toning hue bar's track: every hue at the chosen strength.
export function splitHueTrackGradient(strength: number): string {
  const stops: string[] = [];
  for (let turn = -180; turn <= 180; turn += 30) stops.push(new THREE.Color().setHSL((turn + 360) % 360 / 360, Math.max(strength, 0.35), 0.5, THREE.SRGBColorSpace).getStyle());
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

const SAMPLES = 2; // MSAA; 4 (three.js's example) dropped frames in walk mode, 2 measured as no grade (2026-11-10)

// A multisampled half-float target, as the official example, with a float depth texture so the target gets a 32-bit
// float depth buffer: the reversed depth buffer needs it for its precision ([B171]).
function makeTarget(width: number, height: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(width, height, {
    samples: SAMPLES,
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(width, height, THREE.FloatType),
  });
}

export class ColorGrade {
  private composer: EffectComposer;
  private pass: ShaderPass;
  private renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer, makeTarget(Math.max(size.x, 1), Math.max(size.y, 1)));
    this.pass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uLift: { value: new THREE.Vector3() },
        uGamma: { value: new THREE.Vector3(1, 1, 1) },
        uGain: { value: new THREE.Vector3(1, 1, 1) },
        uSaturation: { value: 1 },
        uSplitShadows: { value: new THREE.Vector4(0.5, 0.5, 0.5, 0) },
        uSplitHighlights: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
      },
      vertexShader: CopyShader.vertexShader,
      fragmentShader: colorGradeFrag,
    });
    this.composer.addPass(this.pass);
  }

  // CSS pixels; the composer scales by the renderer's pixel ratio. A target's depth texture keeps its old size on
  // resize (RenderTarget.setSize leaves it), so each gets a new one.
  setSize(width: number, height: number) {
    this.composer.setSize(width, height);
    for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      const depth = target.depthTexture;
      if (depth && (depth.image.width !== target.width || depth.image.height !== target.height)) {
        depth.dispose();
        target.depthTexture = new THREE.DepthTexture(target.width, target.height, THREE.FloatType);
      }
    }
  }

  update(settings: ColorGradeSettings) {
    if (!settings.enabled) settings = DEFAULT_COLOR_GRADE; // off: the neutral grade, the frame unchanged
    const uniforms = this.pass.uniforms;
    const [lift, gamma, gain] = prepareLiftGammaGain(settings.lift, settings.gamma, settings.gain);
    uniforms.uLift.value.copy(lift);
    uniforms.uGamma.value.copy(gamma);
    uniforms.uGain.value.copy(gain);
    uniforms.uSaturation.value = settings.saturation;
    const { hue, shadowOffset, strength, balance } = settings.split;
    const shadows = splitTint(hue + shadowOffset, strength);
    uniforms.uSplitShadows.value.set(shadows.x, shadows.y, shadows.z, balance);
    uniforms.uSplitHighlights.value.copy(splitTint(hue, strength));
  }

  // Start of a frame: clear the off-screen image every view draws into.
  begin() {
    const target = this.composer.readBuffer;
    target.scissorTest = false;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
  }

  // One view into its rectangle (CSS pixels, bottom-left origin). Set every time, since a view's own passes switch
  // targets; three.js takes a target's rectangle from its own viewport and scissor, in its pixels.
  drawView(scene: THREE.Scene, camera: THREE.Camera, left: number, bottom: number, width: number, height: number) {
    const target = this.composer.readBuffer;
    const ratio = this.renderer.getPixelRatio();
    target.viewport.set(left * ratio, bottom * ratio, width * ratio, height * ratio);
    target.scissor.copy(target.viewport);
    target.scissorTest = true;
    this.renderer.setRenderTarget(target);
    this.renderer.render(scene, camera);
  }

  // End of a frame: the grade pass draws the whole image to the screen.
  finish(canvasWidth: number, canvasHeight: number) {
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, canvasWidth, canvasHeight);
    this.composer.render();
  }

  dispose() {
    this.composer.renderTarget1.depthTexture?.dispose();
    this.composer.renderTarget2.depthTexture?.dispose();
    this.composer.dispose();
    this.pass.dispose();
  }
}
