import * as THREE from 'three';
import { groundHeightAt, type ChunkGround } from '../voxel/chunkGround';

// Chunk units are kilometers (Size (km)), so meters convert by 1000.
export const METERS_PER_UNIT = 1000;
// The starting eye height: 1.7 m sat inside slopes the drawn ground raises up to 7 m above walk mode's height read
// ([B165]); 8 m is Dana's pick (2026-11-09). TUNABLE
export const EYE_HEIGHT_METERS = 8;
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
// The eye eases toward its standing height both ways (Dana, 2026-11-04: "it needs to be much smoother"); it only jumps
// when the ground would come within this of it, and only that far, so it is never inside a slope ([B129]). TUNABLE
const MIN_CLEARANCE_METERS = 0.5;
// A map jump glides there with the fly-in's ease, curving up by this share of the distance so the path clears the
// ground between, as Cesium's camera flyTo arcs over terrain. Inferred, TUNABLE
const JUMP_ARC_SHARE = 0.25;
// The eye stands above the highest ground within this radius, so a rise just ahead lifts it before the camera reaches
// it (a character controller's capsule, not a point). Inferred, TUNABLE.
const GROUND_PROBE_METERS = 1;
const EDGE_MARGIN = 0.999;
const LOOK_RADIANS_PER_PIXEL = 0.0025;
const MAX_PITCH = Math.PI / 2 - 0.02;
// A press that moves less than this many pixels is a hold, not a drag.
const CLICK_MAX_PIXELS = 5;
// Long-press to walk: a still press this long starts walking; a drag before then only looks (Android's long press is
// 400 to 500 ms; shorter here so walking feels quick). Inferred, TUNABLE.
const HOLD_TO_WALK_MS = 250;
// The fly-in from the orbit view to the person view, eased in and out. Inferred, TUNABLE.
const TRANSITION_SECONDS = 1.5;
// No walking on water (Dana, 2026-10-27): walking stops at the shore, and entering over water starts on the nearest shore, found on the coarse height copy
// (as Unity's NavMesh.SamplePosition finds the nearest walkable point), then stepped this far inland. Inferred, TUNABLE.
const SHORE_INLAND_METERS = 2;
const SHORE_VERIFY_ATTEMPTS = 8;

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
  speedMultiplier = 1; // the gumball's walk Speed slider, ×0.5 to ×5
  eyeHeightMeters = EYE_HEIGHT_METERS; // the gumball's Eye height slider, which replaces Zoom while walking
  // 0 at the start of the fly-in, 1 once arrived (and for the whole walk after).
  progress = 1;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly domElement: HTMLElement;
  private readonly getGround: () => ChunkGround | null;
  // The drawn ground's height at a point, or null when it can't be read yet.
  private readonly getGroundHeight: (x: number, z: number) => number | null;
  // The water surface's height, or null when there is no water.
  private readonly getWaterHeight: (x: number, z: number) => number | null; // the sea or a lake there, null if none
  private readonly onExit: () => void;
  private readonly keys = new Set<string>();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private holding = false; // a long press is walking forward until release; dragging then steers (Dana, 2026-10-28)
  private pressTime = 0;
  private pressStart: { x: number; y: number } | null = null;
  private lastPointer = { x: 0, y: 0 };
  private dragged = false;
  // jump: a map jump while already walking, so the orbit-to-walk blend (progress) stays at 1; arc: its lift at the middle.
  private transition: { startPosition: THREE.Vector3; startQuaternion: THREE.Quaternion; endQuaternion: THREE.Quaternion; endX: number; endZ: number; elapsed: number; jump?: boolean; arc?: number } | null = null;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    getGround: () => ChunkGround | null,
    getGroundHeight: (x: number, z: number) => number | null,
    getWaterHeight: (x: number, z: number) => number | null,
    onExit: () => void,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.getGround = getGround;
    this.getGroundHeight = getGroundHeight;
    this.getWaterHeight = getWaterHeight;
    this.onExit = onExit;
  }

  private heightAt(ground: ChunkGround, x: number, z: number): number {
    return this.getGroundHeight(x, z) ?? groundHeightAt(ground, x, z) ?? 0;
  }

  // The nearest dry point to (x, z). Candidates come from rings of coarse samples above a level; each is checked against
  // the drawn ground (one GPU read), and when the coarse copy reads too high there, the level rises by the gap and the
  // search runs again. Returns the point itself when it is dry.
  private nearestShore(ground: ChunkGround, x: number, z: number): THREE.Vector2 {
    const sea = this.getWaterHeight(x, z);
    // Dry by the CPU ground (the preview map), not the drawn patches: a map jump's destination hasn't loaded yet, so its
    // coarse patches read as land above the lake and landed the walker in the water (measured, 2026-11-05).
    const isDry = (px: number, pz: number) => (groundHeightAt(ground, px, pz) ?? 0) >= (this.getWaterHeight(px, pz) ?? -Infinity);
    if (sea === null || isDry(x, z)) return new THREE.Vector2(x, z);
    let level = sea;
    for (let attempt = 0; attempt < SHORE_VERIFY_ATTEMPTS; attempt++) {
      const candidate = this.nearestCoarseAbove(ground, x, z, level);
      if (!candidate) break;
      const drawn = groundHeightAt(ground, candidate.x, candidate.y);
      if (drawn === null || drawn >= (this.getWaterHeight(candidate.x, candidate.y) ?? -Infinity) + SHORE_INLAND_METERS / METERS_PER_UNIT) return candidate;
      level += sea - drawn + SHORE_INLAND_METERS / METERS_PER_UNIT;
    }
    return new THREE.Vector2(this.camera.position.x, this.camera.position.z); // no dry land found: stay put
  }

  // The nearest coarse sample to (x, z) whose height is at least `level`, searched in rings outward, or null.
  private nearestCoarseAbove(ground: ChunkGround, x: number, z: number, level: number): THREE.Vector2 | null {
    const { heights, chunkSize, maxHeight, heightBase } = ground;
    const cellX = chunkSize / (heights.width - 1);
    const cellZ = chunkSize / (heights.height - 1);
    const startX = Math.round((x / chunkSize + 0.5) * (heights.width - 1));
    const startY = Math.round((0.5 - z / chunkSize) * (heights.height - 1)); // rows run opposite to z (groundHeightAt)
    let best: THREE.Vector2 | null = null;
    let bestDistance = Infinity;
    const maxRing = Math.max(heights.width, heights.height);
    for (let ring = 1; ring < maxRing && ring * Math.min(cellX, cellZ) < bestDistance; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const px = startX + dx;
          const py = startY + dy;
          if (px < 0 || py < 0 || px >= heights.width || py >= heights.height) continue;
          if (Math.max(0, heights.data[py * heights.width + px] + heightBase) * maxHeight < level) continue;
          const sampleX = (px / (heights.width - 1) - 0.5) * chunkSize;
          const sampleZ = (0.5 - py / (heights.height - 1)) * chunkSize;
          const distance = Math.hypot(sampleX - x, sampleZ - z);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = new THREE.Vector2(sampleX, sampleZ);
          }
        }
      }
    }
    return best;
  }

  // Flies the camera from where it is to standing at (endX, endZ), level, facing `yaw`.
  enter(endX: number, endZ: number, yaw: number): void {
    const ground = this.getGround();
    if (!ground) return;
    this.camera.up.set(0, 1, 0);
    const limit = (ground.chunkSize / 2) * EDGE_MARGIN;
    const shore = this.nearestShore(ground, endX, endZ);
    endX = shore.x;
    endZ = shore.y;
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
    this.holding = false;
    this.domElement.style.cursor = 'grab';
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.domElement.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  // The walk map's click: glides to (x, z), standing on the ground or the nearest shore, facing the same way.
  teleport(x: number, z: number): void {
    const ground = this.getGround();
    if (!this.active || !ground) return;
    const limit = (ground.chunkSize / 2) * EDGE_MARGIN;
    const shore = this.nearestShore(ground, THREE.MathUtils.clamp(x, -limit, limit), THREE.MathUtils.clamp(z, -limit, limit));
    const distance = Math.hypot(shore.x - this.camera.position.x, shore.y - this.camera.position.z);
    this.transition = {
      startPosition: this.camera.position.clone(),
      startQuaternion: this.camera.quaternion.clone(),
      endQuaternion: this.camera.quaternion.clone(),
      endX: shore.x,
      endZ: shore.y,
      elapsed: 0,
      jump: true,
      arc: distance * JUMP_ARC_SHARE,
    };
  }

  // The highest ground within the probe at (x, z), or the water there if higher ([B129]).
  private floorAt(ground: ChunkGround, x: number, z: number): number {
    const probe = GROUND_PROBE_METERS / METERS_PER_UNIT;
    let groundAround = this.heightAt(ground, x, z);
    for (const [dx, dz] of [[probe, 0], [-probe, 0], [0, probe], [0, -probe]]) groundAround = Math.max(groundAround, this.heightAt(ground, x + dx, z + dz));
    return Math.max(groundAround, this.getWaterHeight(x, z) ?? -Infinity);
  }

  // Eases the eye toward standing, never closer to the floor than MIN_CLEARANCE_METERS.
  private placeEye(ground: ChunkGround, deltaSeconds: number): void {
    const { x, z } = this.camera.position;
    const floor = this.floorAt(ground, x, z);
    const standing = floor + this.eyeHeightMeters / METERS_PER_UNIT;
    this.camera.position.y += (standing - this.camera.position.y) * (1 - Math.exp(-HEIGHT_SMOOTHING_PER_SECOND * deltaSeconds));
    this.camera.position.y = Math.max(this.camera.position.y, floor + MIN_CLEARANCE_METERS / METERS_PER_UNIT);
  }

  // Run after the frame's ground pieces are swapped in: update() set the eye from the ground before the swap, so a piece
  // that came in higher left the eye inside it for a frame, which drew as stripes (measured 80 m under, 2026-11-04).
  settleEye(): void {
    const ground = this.getGround();
    if (!this.active || !ground || this.transition) return;
    this.placeEye(ground, 0); // no easing step: only the clearance floor
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.progress = 1;
    this.transition = null;
    this.keys.clear();
    this.holding = false;
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
    this.holding = false;
    this.pressTime = performance.now();
    this.domElement.setPointerCapture(event.pointerId);
  };

  // Dragging turns the view (the world follows the cursor), steering the walk while held.
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

  // Releasing stops the walk.
  private readonly handlePointerUp = () => {
    if (!this.pressStart) return;
    this.pressStart = null;
    this.holding = false;
    this.domElement.style.cursor = 'grab';
  };

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
    if (this.pressStart && !this.holding && !this.dragged && performance.now() - this.pressTime >= HOLD_TO_WALK_MS) this.holding = true;
    const isRunning = RUN_KEYS.some((code) => this.keys.has(code));
    // Speed proportional to height above the ground, as Cesium's Camera Tutorial moves by height / 100 a tick; unchanged at
    // the default eye height.
    const heightScale = this.eyeHeightMeters / EYE_HEIGHT_METERS;
    const step = ((WALK_SPEED_MPS * this.speedMultiplier) / METERS_PER_UNIT) * this.travelScale * heightScale * (isRunning ? RUN_MULTIPLIER : 1) * deltaSeconds;

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
    const axisForward = Number(this.holding || FORWARD_KEYS.some((code) => this.keys.has(code))) - Number(BACK_KEYS.some((code) => this.keys.has(code)));
    const axisRight = Number(RIGHT_KEYS.some((code) => this.keys.has(code))) - Number(LEFT_KEYS.some((code) => this.keys.has(code)));
    let moveX = forwardX * axisForward - forwardZ * axisRight;
    let moveZ = forwardZ * axisForward + forwardX * axisRight;
    const length = Math.hypot(moveX, moveZ);
    if (length > 0) {
      moveX = (moveX / length) * step;
      moveZ = (moveZ / length) * step;
    }
    const fromX = this.camera.position.x;
    const fromZ = this.camera.position.z;
    this.camera.position.x += moveX;
    this.camera.position.z += moveZ;
    this.clampToChunk(this.camera.position, ground);

    // Water stops the walker at the waterline, like a wall; the same height read serves the eye.
    let groundHeight = this.heightAt(ground, this.camera.position.x, this.camera.position.z);
    // The sea or a lake at the new spot: both stop the walker the same way.
    let sea = this.getWaterHeight(this.camera.position.x, this.camera.position.z);
    if (sea !== null && groundHeight < sea && (moveX !== 0 || moveZ !== 0)) {
      this.camera.position.x = fromX;
      this.camera.position.z = fromZ;
      groundHeight = this.heightAt(ground, fromX, fromZ);
      sea = this.getWaterHeight(fromX, fromZ);
    }
    // No per-frame push to the shore: it moved the walker sideways in one frame whenever finer ground loaded in lower than
    // the water (Dana, 2026-11-04). The eye's floor already includes the water, so it can't go under it.
    // Eased both ways, held off the ground by the clearance, so it never lags into a slope ([B129]).
    this.placeEye(ground, deltaSeconds);
  }

  // The fly-in: position and facing ease from the orbit view to the standing spot.
  private flyIn(ground: ChunkGround, deltaSeconds: number): void {
    const transition = this.transition!;
    transition.elapsed += deltaSeconds;
    const raw = Math.min(1, transition.elapsed / TRANSITION_SECONDS);
    const eased = raw < 0.5 ? 4 * raw ** 3 : 1 - (-2 * raw + 2) ** 3 / 2;
    const endY = this.heightAt(ground, transition.endX, transition.endZ) + this.eyeHeightMeters / METERS_PER_UNIT;
    const x = THREE.MathUtils.lerp(transition.startPosition.x, transition.endX, eased);
    const z = THREE.MathUtils.lerp(transition.startPosition.z, transition.endZ, eased);
    // A jump arcs up in the middle and never dips under the ground it passes over.
    const lift = (transition.arc ?? 0) * Math.sin(Math.PI * eased);
    const y = THREE.MathUtils.lerp(transition.startPosition.y, endY, eased) + lift;
    this.camera.position.set(x, transition.jump ? Math.max(y, this.floorAt(ground, x, z) + MIN_CLEARANCE_METERS / METERS_PER_UNIT) : y, z);
    this.camera.quaternion.slerpQuaternions(transition.startQuaternion, transition.endQuaternion, eased);
    if (!transition.jump) this.progress = eased;
    if (raw >= 1) this.transition = null;
  }

  dispose(): void {
    this.exit();
  }
}
