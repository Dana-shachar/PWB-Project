import * as THREE from 'three';
import { groundHeightAt, type ChunkGround } from '../voxel/chunkGround';

// Chunk units are kilometers (Size (km)), so meters convert by 1000.
const METERS_PER_UNIT = 1000;
export const EYE_HEIGHT_METERS = 1.7;
// About a typical adult's walking pace; the run factor is inferred from Unity's
// Starter Assets sprint-to-move ratio (5.335 / 2.0). Both TUNABLE.
export const WALK_SPEED_MPS = 1.4;
export const RUN_MULTIPLIER = 2.7;
// The wheel scales travel speed (ArcGIS first-person), so a 16 km chunk is crossable.
// This tool is for building terrain, not playing it, so the default is quick: 10x walking, about 14 m/s.
const DEFAULT_TRAVEL_SCALE = 10;
const MIN_TRAVEL_SCALE = 1;
const MAX_TRAVEL_SCALE = 2000;
const WHEEL_TRAVEL_FACTOR = 1.25;
const HEIGHT_SMOOTHING_PER_SECOND = 10;
const EDGE_MARGIN = 0.999;
const ARRIVE_DISTANCE_STEPS = 1;
const LOOK_RADIANS_PER_PIXEL = 0.0025;
const MAX_PITCH = Math.PI / 2 - 0.02;
// A press that moves less than this many pixels is a click, not a drag.
const CLICK_MAX_PIXELS = 5;
// A click's ray is marched against the drawn ground in steps that grow with distance
// (each step 5% of the distance so far, at least 1 m), then narrowed by bisection.
const PICK_MIN_STEP = 1 / METERS_PER_UNIT;
const PICK_STEP_FRACTION = 0.05;
const PICK_REFINE_STEPS = 12;
// The fly-in from the orbit view to the person view, eased in and out. Inferred, TUNABLE.
const TRANSITION_SECONDS = 1.5;

const FORWARD_KEYS = ['KeyW', 'ArrowUp'];
const BACK_KEYS = ['KeyS', 'ArrowDown'];
const LEFT_KEYS = ['KeyA'];
const RIGHT_KEYS = ['KeyD'];
// Keyboard-only look: arrows turn, R/F or PageUp/PageDown look up and down.
const TURN_LEFT_KEYS = ['ArrowLeft'];
const TURN_RIGHT_KEYS = ['ArrowRight'];
const LOOK_UP_KEYS = ['KeyR', 'PageUp'];
const LOOK_DOWN_KEYS = ['KeyF', 'PageDown'];
const FASTER_KEYS = ['BracketRight', 'Equal'];
const SLOWER_KEYS = ['BracketLeft', 'Minus'];
const TURN_RADIANS_PER_SECOND = 1.5;
const RUN_KEYS = ['ShiftLeft', 'ShiftRight'];

// Person view on the land chunk. Drag to look (the world follows the cursor,
// as in street-view navigation), click to walk to that spot, WASD or arrows to
// walk, Shift to run, the wheel or [ ] to scale travel speed, Esc to leave. The
// keyboard alone works: arrows move and turn, R/F look up and down. The eye
// follows the ground at a set height.
export class WalkMode {
  active = false;
  travelScale = DEFAULT_TRAVEL_SCALE;
  // 0 at the start of the fly-in, 1 once arrived (and for the whole walk after).
  progress = 1;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly getGround: () => ChunkGround | null;
  // The drawn ground's height at a point, or null when it can't be read yet.
  private readonly getGroundHeight: (x: number, z: number) => number | null;
  private readonly onExit: () => void;
  private readonly keys = new Set<string>();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly raycaster = new THREE.Raycaster();
  private walkTarget: THREE.Vector2 | null = null;
  private pressStart: { x: number; y: number } | null = null;
  private lastPointer = { x: 0, y: 0 };
  private dragged = false;
  private transition: { startPosition: THREE.Vector3; startQuaternion: THREE.Quaternion; endQuaternion: THREE.Quaternion; endX: number; endZ: number; elapsed: number } | null = null;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    getGround: () => ChunkGround | null,
    getGroundHeight: (x: number, z: number) => number | null,
    onExit: () => void,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.getGround = getGround;
    this.getGroundHeight = getGroundHeight;
    this.onExit = onExit;
  }

  private heightAt(ground: ChunkGround, x: number, z: number): number {
    return this.getGroundHeight(x, z) ?? groundHeightAt(ground, x, z) ?? 0;
  }

  // Flies the camera from where it is to standing at (endX, endZ), level, facing `yaw`.
  enter(endX: number, endZ: number, yaw: number): void {
    const ground = this.getGround();
    if (!ground) return;
    this.camera.up.set(0, 1, 0);
    const limit = (ground.chunkSize / 2) * EDGE_MARGIN;
    this.transition = {
      startPosition: this.camera.position.clone(),
      startQuaternion: this.camera.quaternion.clone(),
      endQuaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ')),
      endX: THREE.MathUtils.clamp(endX, -limit, limit),
      endZ: THREE.MathUtils.clamp(endZ, -limit, limit),
      elapsed: 0,
    };
    this.progress = 0;
    this.active = true;
    this.walkTarget = null;
    this.domElement.style.cursor = 'grab';
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.domElement.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.progress = 1;
    this.transition = null;
    this.keys.clear();
    this.walkTarget = null;
    this.pressStart = null;
    this.domElement.style.cursor = '';
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.domElement.removeEventListener('wheel', this.handleWheel);
    this.onExit();
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'Escape') {
      this.exit();
      return;
    }
    if (FASTER_KEYS.includes(event.code)) this.scaleTravel(WHEEL_TRAVEL_FACTOR);
    if (SLOWER_KEYS.includes(event.code)) this.scaleTravel(1 / WHEEL_TRAVEL_FACTOR);
    this.keys.add(event.code);
    if ([...FORWARD_KEYS, ...BACK_KEYS, ...LEFT_KEYS, ...RIGHT_KEYS, ...TURN_LEFT_KEYS, ...TURN_RIGHT_KEYS, ...LOOK_UP_KEYS, ...LOOK_DOWN_KEYS].includes(event.code)) {
      this.walkTarget = null;
      event.preventDefault(); // arrows would otherwise scroll the page
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private readonly handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.scaleTravel(event.deltaY < 0 ? WHEEL_TRAVEL_FACTOR : 1 / WHEEL_TRAVEL_FACTOR);
  };

  private scaleTravel(factor: number): void {
    this.travelScale = THREE.MathUtils.clamp(this.travelScale * factor, MIN_TRAVEL_SCALE, MAX_TRAVEL_SCALE);
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.pressStart = { x: event.clientX, y: event.clientY };
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.dragged = false;
    this.domElement.setPointerCapture(event.pointerId);
  };

  // Dragging turns the view: the world follows the cursor.
  private readonly handlePointerMove = (event: PointerEvent) => {
    if (!this.pressStart) return;
    if (!this.dragged && Math.hypot(event.clientX - this.pressStart.x, event.clientY - this.pressStart.y) > CLICK_MAX_PIXELS) {
      this.dragged = true;
      this.domElement.style.cursor = 'grabbing';
    }
    if (!this.dragged) return;
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.euler.y += (event.clientX - this.lastPointer.x) * LOOK_RADIANS_PER_PIXEL;
    this.euler.x = THREE.MathUtils.clamp(this.euler.x + (event.clientY - this.lastPointer.y) * LOOK_RADIANS_PER_PIXEL, -MAX_PITCH, MAX_PITCH);
    this.camera.quaternion.setFromEuler(this.euler);
    this.lastPointer = { x: event.clientX, y: event.clientY };
  };

  // A press without a drag is a click: walk to the ground under the cursor.
  private readonly handlePointerUp = (event: PointerEvent) => {
    if (!this.pressStart) return;
    const wasClick = !this.dragged;
    this.pressStart = null;
    this.domElement.style.cursor = 'grab';
    if (!wasClick) return;
    const ground = this.getGround();
    if (!ground) return;
    const rect = this.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.pickGround(this.raycaster.ray, ground);
    if (hit) this.walkTarget = new THREE.Vector2(hit.x, hit.z);
  };

  // Where a ray first meets the drawn ground (the same height the eye follows), or null.
  private pickGround(ray: THREE.Ray, ground: ChunkGround): THREE.Vector3 | null {
    const half = ground.chunkSize / 2;
    const point = new THREE.Vector3();
    const isBelow = (distance: number): boolean => {
      ray.at(distance, point);
      const height = this.getGroundHeight(point.x, point.z);
      return height !== null && point.y <= height;
    };
    let above = 0;
    let distance = PICK_MIN_STEP;
    while (distance <= ground.chunkSize * 2) {
      ray.at(distance, point);
      if (Math.abs(point.x) > half || Math.abs(point.z) > half) return null; // left the chunk
      if (isBelow(distance)) {
        let below = distance;
        for (let i = 0; i < PICK_REFINE_STEPS; i++) {
          const middle = (above + below) / 2;
          if (isBelow(middle)) below = middle;
          else above = middle;
        }
        return ray.at(below, new THREE.Vector3());
      }
      above = distance;
      distance += Math.max(PICK_MIN_STEP, distance * PICK_STEP_FRACTION);
    }
    return null;
  }

  private clampToChunk(position: THREE.Vector3, ground: ChunkGround): void {
    const limit = (ground.chunkSize / 2) * EDGE_MARGIN;
    position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
    position.z = THREE.MathUtils.clamp(position.z, -limit, limit);
  }

  // Each frame: move by keys or toward the clicked spot, then ride the ground.
  update(deltaSeconds: number): void {
    const ground = this.getGround();
    if (!this.active || !ground) return;
    if (this.transition) {
      this.flyIn(ground, deltaSeconds);
      return;
    }
    const isRunning = RUN_KEYS.some((code) => this.keys.has(code));
    const step = (WALK_SPEED_MPS / METERS_PER_UNIT) * this.travelScale * (isRunning ? RUN_MULTIPLIER : 1) * deltaSeconds;

    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    const turn = Number(TURN_LEFT_KEYS.some((code) => this.keys.has(code))) - Number(TURN_RIGHT_KEYS.some((code) => this.keys.has(code)));
    const look = Number(LOOK_UP_KEYS.some((code) => this.keys.has(code))) - Number(LOOK_DOWN_KEYS.some((code) => this.keys.has(code)));
    if (turn !== 0 || look !== 0) {
      this.euler.y += turn * TURN_RADIANS_PER_SECOND * deltaSeconds;
      this.euler.x = THREE.MathUtils.clamp(this.euler.x + look * TURN_RADIANS_PER_SECOND * deltaSeconds, -MAX_PITCH, MAX_PITCH);
      this.camera.quaternion.setFromEuler(this.euler);
    }
    const forwardX = -Math.sin(this.euler.y);
    const forwardZ = -Math.cos(this.euler.y);
    const axisForward = Number(FORWARD_KEYS.some((code) => this.keys.has(code))) - Number(BACK_KEYS.some((code) => this.keys.has(code)));
    const axisRight = Number(RIGHT_KEYS.some((code) => this.keys.has(code))) - Number(LEFT_KEYS.some((code) => this.keys.has(code)));
    let moveX = forwardX * axisForward - forwardZ * axisRight;
    let moveZ = forwardZ * axisForward + forwardX * axisRight;
    const length = Math.hypot(moveX, moveZ);
    if (length > 0) {
      moveX = (moveX / length) * step;
      moveZ = (moveZ / length) * step;
    } else if (this.walkTarget) {
      const toX = this.walkTarget.x - this.camera.position.x;
      const toZ = this.walkTarget.y - this.camera.position.z;
      const distance = Math.hypot(toX, toZ);
      if (distance <= step * ARRIVE_DISTANCE_STEPS) {
        moveX = toX;
        moveZ = toZ;
        this.walkTarget = null;
      } else {
        moveX = (toX / distance) * step;
        moveZ = (toZ / distance) * step;
      }
    }
    this.camera.position.x += moveX;
    this.camera.position.z += moveZ;
    this.clampToChunk(this.camera.position, ground);

    const eyeHeight = this.heightAt(ground, this.camera.position.x, this.camera.position.z) + EYE_HEIGHT_METERS / METERS_PER_UNIT;
    const blend = 1 - Math.exp(-HEIGHT_SMOOTHING_PER_SECOND * deltaSeconds);
    this.camera.position.y += (eyeHeight - this.camera.position.y) * blend;
  }

  // The fly-in: position and facing ease from the orbit view to the standing spot.
  private flyIn(ground: ChunkGround, deltaSeconds: number): void {
    const transition = this.transition!;
    transition.elapsed += deltaSeconds;
    const raw = Math.min(1, transition.elapsed / TRANSITION_SECONDS);
    const eased = raw < 0.5 ? 4 * raw ** 3 : 1 - (-2 * raw + 2) ** 3 / 2;
    const endY = this.heightAt(ground, transition.endX, transition.endZ) + EYE_HEIGHT_METERS / METERS_PER_UNIT;
    this.camera.position.set(
      THREE.MathUtils.lerp(transition.startPosition.x, transition.endX, eased),
      THREE.MathUtils.lerp(transition.startPosition.y, endY, eased),
      THREE.MathUtils.lerp(transition.startPosition.z, transition.endZ, eased),
    );
    this.camera.quaternion.slerpQuaternions(transition.startQuaternion, transition.endQuaternion, eased);
    this.progress = eased;
    if (raw >= 1) this.transition = null;
  }

  dispose(): void {
    this.exit();
  }
}
