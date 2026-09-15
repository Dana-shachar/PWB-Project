import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DEFAULT_CAMERA_DISTANCE, defaultCameraPosition } from './camera';

type ViewPreset = 'top' | 'front' | 'side' | 'perspective';

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
// - Positioned bottom-right, not bottom-left (panel is on the left here).
// - View presets are a <select> dropdown, not 4 separate buttons (too much space).
// - Has dispose() — the original never needed to tear down its DOM.
//
// Usage: const gumball = new Gumball(camera, cameraControls, mountElement);
//        call gumball.update() every frame, gumball.dispose() on cleanup.
export class Gumball {
  private camera: THREE.PerspectiveCamera;
  private cameraControls: OrbitControls;
  private readonly armLength = 28;
  private readonly labelOffset = 38;
  private readonly centerX = 40;
  private readonly centerY = 40;
  private readonly snapSpeed = 0.08;
  private snapTarget: THREE.Vector3 | null = null;
  private zoomLevel: number;
  private zoomInput: HTMLInputElement | null = null;
  private container: HTMLDivElement;
  private svgElements: Record<string, { line: SVGLineElement; text: SVGTextElement }> = {};

  // mountElement: the 3D viewport's own container, not document.body — keeps
  // the widget confined to the viewport (position: absolute against it) so
  // it doesn't drift onto whatever sits beside the viewport, e.g. the
  // right-side NoisePanel added 2026-09-14.
  constructor(camera: THREE.PerspectiveCamera, cameraControls: OrbitControls, mountElement: HTMLElement) {
    this.camera = camera;
    this.cameraControls = cameraControls;
    const initialDistance = camera.position.distanceTo(cameraControls.target);
    this.zoomLevel = Math.round((DEFAULT_CAMERA_DISTANCE * 100) / initialDistance);
    this.container = this.buildPanel();
    mountElement.appendChild(this.container);
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
    const targetDistance = (DEFAULT_CAMERA_DISTANCE * 100) / this.zoomLevel;
    const orbitDirection = this.camera.position.clone().sub(this.cameraControls.target).normalize();
    this.camera.position.copy(this.cameraControls.target).addScaledVector(orbitDirection, targetDistance);
  };

  resetScene(): void {
    this.camera.position.copy(defaultCameraPosition());
    this.camera.up.set(0, 1, 0);
    this.cameraControls.target.set(0, 0, 0);
    this.cameraControls.update();
  }

  snapToView(preset: ViewPreset): void {
    const orbitDist = this.camera.position.distanceTo(this.cameraControls.target);
    const diagDist = orbitDist / Math.sqrt(3);

    // Offset each preset by the current orbit target so the camera always
    // frames whatever the orbit is centered on, not the world origin.
    const orbitCenter = this.cameraControls.target;
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
    this.camera.up.copy(snapTarget.up); // set immediately — avoids gimbal lock during the lerp
    this.snapTarget = snapTarget.position;
    this.cameraControls.enabled = false; // block orbit input during snap
  }

  update(): void {
    // Recompute zoomLevel from the camera's actual current distance every
    // frame, so the slider stays in sync whether zoom changed via the
    // slider, scroll-wheel dolly, or a view-preset snap.
    const currentDistance = this.camera.position.distanceTo(this.cameraControls.target);
    this.zoomLevel = Math.max(10, Math.min(400, Math.round((DEFAULT_CAMERA_DISTANCE * 100) / currentDistance)));

    if (this.zoomInput && document.activeElement !== this.zoomInput) {
      const zoomStr = String(this.zoomLevel);
      if (this.zoomInput.value !== zoomStr) this.zoomInput.value = zoomStr;
    }

    // Smooth snap animation
    if (this.snapTarget) {
      this.camera.position.lerp(this.snapTarget, this.snapSpeed);
      this.cameraControls.update();
      if (this.camera.position.distanceTo(this.snapTarget) < 0.001) {
        this.camera.position.copy(this.snapTarget);
        this.snapTarget = null;
        this.cameraControls.enabled = true;
      }
    }

    // SVG axes update — columns 0/1 of matrixWorld are the camera's
    // world-space right/up vectors; project each world axis onto them to
    // get 2D screen coordinates (SVG Y is inverted vs. math Y).
    const worldMatrix = this.camera.matrixWorld.elements;
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
