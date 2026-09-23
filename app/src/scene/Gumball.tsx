import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { defaultCameraPosition } from './camera';

type ViewPreset = 'top' | 'front' | 'side' | 'perspective';

// One camera/controls pair the gumball can drive. A single shared instance
// can target 1 (a specific viewport pane, clicked) or 2 of these at once
// (shift+click both — see scene/sharedGumball.ts) — every action loops over
// however many are currently set via setTargets(). `referenceDistance` is
// this target's own "100% zoom"/reset distance (e.g. the planet's
// DEFAULT_CAMERA_DISTANCE vs. the land chunk's own much smaller
// CHUNK_CAMERA_DISTANCE) — without it, zoom/reset used one fixed distance
// for every target regardless of scale, so the chunk's zoom slider could
// only ever move it farther away, never closer (Dana, 2026-09-23: "zoom
// isn't working for the chunk"). See ISSUES.md, 2026-09-23.
export interface GumballTarget {
  camera: THREE.PerspectiveCamera;
  cameraControls: OrbitControls;
  referenceDistance: number;
}

interface AxisConfig {
  key: 'x' | 'y' | 'z';
  colorVar: string; // CSS custom property name, e.g. '--color-axis-x'
  label: string;
  worldDir: THREE.Vector3;
}

const AXIS_CONFIGS: AxisConfig[] = [
  { key: 'x', colorVar: '--color-axis-x', label: 'X', worldDir: new THREE.Vector3(1, 0, 0) },
  { key: 'y', colorVar: '--color-axis-y', label: 'Y', worldDir: new THREE.Vector3(0, 1, 0) },
  { key: 'z', colorVar: '--color-axis-z', label: 'Z', worldDir: new THREE.Vector3(0, 0, 1) },
];

// Orientation/navigation widget: SVG axes indicator that rotates live with
// the camera, plus a zoom slider and view preset buttons (TOP/FRONT/SIDE/
// PERSPECTIVE) + RESET. Ported from active-geometry-project's gumball.js —
// a plain class with imperative DOM (like the original), not a React
// component, since translating the calibration math through React state/JSX
// would be the likeliest way to accidentally break something already solved.
//
// Deliberate differences from the original (see Roadmap.md):
// - No shared `settings` object — zoomLevel is this class's own field.
// - Positioned top-right (was bottom-right, then bottom-left in the original).
// - View presets are a <select> dropdown, not 4 separate buttons (too much space).
// - Has dispose() — the original never needed to tear down its DOM.
// - Drives a LIST of targets, not one fixed camera (2026-09-23) — one shared
//   instance across the planet and land-chunk viewports (see
//   scene/sharedGumball.ts), retargeted via setTargets() rather than one
//   instance per viewport, so there's only ever one visible widget and
//   shift+click-both drives both cameras from the same controls. The axis
//   indicator and zoom-slider display always reflect targets[0] only — you
//   can't visually show two orientations/distances in one widget, even
//   while driving both.
//
// Usage: const gumball = new Gumball(targets, mountElement);
//        call gumball.update() every frame, gumball.dispose() on cleanup.
export class Gumball {
  private targets: GumballTarget[];
  // One in-progress view-preset snap animation per target, parallel array
  // to `targets` (index-matched) — null where that target isn't mid-snap.
  private snapTargets: (THREE.Vector3 | null)[] = [];
  private readonly armLength = 28;
  private readonly labelOffset = 38;
  private readonly centerX = 40;
  private readonly centerY = 40;
  private readonly snapSpeed = 0.08;
  private zoomLevel: number;
  private zoomInput: HTMLInputElement | null = null;
  private container: HTMLDivElement;
  private svgElements: Record<string, { line: SVGLineElement; text: SVGTextElement }> = {};

  // mountElement: the 3D viewport's own container, not document.body — keeps
  // the widget confined to the viewport (position: absolute against it) so
  // it doesn't drift onto whatever sits beside the viewport, e.g. the
  // right-side NoisePanel added 2026-09-14.
  constructor(targets: GumballTarget[], mountElement: HTMLElement) {
    this.targets = targets;
    this.snapTargets = targets.map(() => null);
    const primary = targets[0];
    const initialDistance = primary.camera.position.distanceTo(primary.cameraControls.target);
    this.zoomLevel = Math.round((primary.referenceDistance * 100) / initialDistance);
    this.container = this.buildPanel();
    mountElement.appendChild(this.container);
  }

  // Switches which camera(s) this instance drives — the widget itself is
  // never recreated, just repointed. Any in-progress snap animation is
  // abandoned and every previous target's controls are re-enabled, so
  // nothing is left stuck mid-snap or disabled after a retarget.
  setTargets(targets: GumballTarget[]): void {
    for (const target of this.targets) {
      target.cameraControls.enabled = true;
    }
    this.targets = targets;
    this.snapTargets = targets.map(() => null);
  }

  private buildPanel(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'gumball-container';

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '80');
    svg.setAttribute('height', '80');
    svg.setAttribute('class', 'gumball-svg');

    const rootStyle = getComputedStyle(document.documentElement);
    for (const config of AXIS_CONFIGS) {
      const color = rootStyle.getPropertyValue(config.colorVar).trim();

      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', String(this.centerX));
      line.setAttribute('y1', String(this.centerY));
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-linecap', 'round');
      // Explicit, not just inherited from the parent svg's class — a
      // rendered stroke still captured drag events otherwise.
      line.setAttribute('pointer-events', 'none');
      svg.appendChild(line);

      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('fill', color);
      text.setAttribute('font-size', '11');
      text.setAttribute('font-family', 'monospace');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('pointer-events', 'none');
      text.textContent = config.label;
      svg.appendChild(text);

      this.svgElements[config.key] = { line, text };
    }
    container.appendChild(svg);

    // Zoom slider
    const zoomRow = document.createElement('div');
    zoomRow.className = 'gumball-zoom-row';

    const zoomLabel = document.createElement('span');
    zoomLabel.textContent = 'Zoom';
    zoomLabel.className = 'gumball-zoom-label';

    this.zoomInput = document.createElement('input');
    this.zoomInput.type = 'range';
    this.zoomInput.min = '10';
    this.zoomInput.max = '400';
    this.zoomInput.step = '1';
    this.zoomInput.value = String(this.zoomLevel);
    this.zoomInput.className = 'gumball-zoom-input';
    this.zoomInput.addEventListener('input', this.handleZoomInput);

    zoomRow.appendChild(zoomLabel);
    zoomRow.appendChild(this.zoomInput);
    container.appendChild(zoomRow);

    // View preset dropdown — was 4 separate buttons, took up too much
    // screen space (Dana, 2026-09-14).
    const viewSelect = document.createElement('select');
    viewSelect.className = 'gumball-view-select';
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = 'View...';
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    viewSelect.appendChild(placeholderOption);
    const presets: ViewPreset[] = ['top', 'front', 'side', 'perspective'];
    for (const preset of presets) {
      const option = document.createElement('option');
      option.value = preset;
      option.textContent = preset.toUpperCase();
      viewSelect.appendChild(option);
    }
    viewSelect.addEventListener('change', () => {
      this.snapToView(viewSelect.value as ViewPreset);
    });
    container.appendChild(viewSelect);

    // Reset view button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'RESET VIEW';
    resetBtn.className = 'gumball-btn';
    resetBtn.addEventListener('click', () => this.resetScene());
    container.appendChild(resetBtn);

    return container;
  }

  private handleZoomInput = () => {
    if (!this.zoomInput) return;
    this.zoomLevel = parseFloat(this.zoomInput.value);
    for (const { camera, cameraControls, referenceDistance } of this.targets) {
      const targetDistance = (referenceDistance * 100) / this.zoomLevel;
      const orbitDirection = camera.position.clone().sub(cameraControls.target).normalize();
      camera.position.copy(cameraControls.target).addScaledVector(orbitDirection, targetDistance);
    }
  };

  resetScene(): void {
    for (const { camera, cameraControls, referenceDistance } of this.targets) {
      camera.position.copy(defaultCameraPosition(referenceDistance));
      camera.up.set(0, 1, 0);
      cameraControls.target.set(0, 0, 0);
      cameraControls.update();
    }
  }

  snapToView(preset: ViewPreset): void {
    this.targets.forEach(({ camera, cameraControls }, index) => {
      const orbitDist = camera.position.distanceTo(cameraControls.target);
      const diagDist = orbitDist / Math.sqrt(3);

      // Offset each preset by the current orbit target so the camera always
      // frames whatever the orbit is centered on, not the world origin.
      const orbitCenter = cameraControls.target;
      const presetMap: Record<ViewPreset, { position: THREE.Vector3; up: THREE.Vector3 }> = {
        top: { position: new THREE.Vector3(0, orbitDist, 0).add(orbitCenter), up: new THREE.Vector3(0, 0, -1) },
        front: { position: new THREE.Vector3(0, 0, orbitDist).add(orbitCenter), up: new THREE.Vector3(0, 1, 0) },
        side: { position: new THREE.Vector3(orbitDist, 0, 0).add(orbitCenter), up: new THREE.Vector3(0, 1, 0) },
        perspective: {
          position: new THREE.Vector3(diagDist, diagDist, diagDist).add(orbitCenter),
          up: new THREE.Vector3(0, 1, 0),
        },
      };

      const snapTarget = presetMap[preset];
      camera.up.copy(snapTarget.up); // set immediately — avoids gimbal lock during the lerp
      this.snapTargets[index] = snapTarget.position;
      cameraControls.enabled = false; // block orbit input during snap
    });
  }

  update(): void {
    const primary = this.targets[0];

    // Recompute zoomLevel from the primary target's actual current
    // distance every frame, so the slider stays in sync whether zoom
    // changed via the slider, scroll-wheel dolly, or a view-preset snap.
    // Only the primary target's state is ever displayed — the widget can't
    // show two distances/orientations at once even while driving both.
    const currentDistance = primary.camera.position.distanceTo(primary.cameraControls.target);
    this.zoomLevel = Math.max(10, Math.min(400, Math.round((primary.referenceDistance * 100) / currentDistance)));

    if (this.zoomInput && document.activeElement !== this.zoomInput) {
      const zoomStr = String(this.zoomLevel);
      if (this.zoomInput.value !== zoomStr) this.zoomInput.value = zoomStr;
    }

    // Smooth snap animation — each target lerps independently.
    this.targets.forEach(({ camera, cameraControls }, index) => {
      const snapTarget = this.snapTargets[index];
      if (!snapTarget) return;
      camera.position.lerp(snapTarget, this.snapSpeed);
      cameraControls.update();
      if (camera.position.distanceTo(snapTarget) < 0.001) {
        camera.position.copy(snapTarget);
        this.snapTargets[index] = null;
        cameraControls.enabled = true;
      }
    });

    // SVG axes update — columns 0/1 of matrixWorld are the camera's
    // world-space right/up vectors; project each world axis onto them to
    // get 2D screen coordinates (SVG Y is inverted vs. math Y). Primary
    // target only, same reasoning as the zoom display above.
    const worldMatrix = primary.camera.matrixWorld.elements;
    const cameraSide = new THREE.Vector3(worldMatrix[0], worldMatrix[1], worldMatrix[2]);
    const cameraUp = new THREE.Vector3(worldMatrix[4], worldMatrix[5], worldMatrix[6]);

    for (const config of AXIS_CONFIGS) {
      const screenX = config.worldDir.dot(cameraSide);
      const screenY = config.worldDir.dot(cameraUp);

      const armEndX = this.centerX + screenX * this.armLength;
      const armEndY = this.centerY - screenY * this.armLength;
      const letterX = this.centerX + screenX * this.labelOffset;
      const letterY = this.centerY - screenY * this.labelOffset;

      const { line, text } = this.svgElements[config.key];
      line.setAttribute('x2', armEndX.toFixed(1));
      line.setAttribute('y2', armEndY.toFixed(1));
      text.setAttribute('x', letterX.toFixed(1));
      text.setAttribute('y', letterY.toFixed(1));
    }
  }

  dispose(): void {
    this.zoomInput?.removeEventListener('input', this.handleZoomInput);
    this.container.remove();
  }
}
