import { useEffect, useImperativeHandle, useRef, forwardRef, type RefObject } from 'react';
import * as THREE from 'three';
import chunkVertexGlsl from '../shaders/terrain/chunk.vert.glsl?raw';
import chunkFragmentBody from '../shaders/terrain/chunk.frag.glsl?raw';
import terrainGlsl from '../shaders/terrain/terrain.glsl?raw';
import hazeGlsl from '../shaders/atmosphere/haze.glsl?raw'; // elevation color ramp + shadow march — shared with fragment.glsl, see shaders/terrain/terrain.glsl
import { camera, defaultCameraPosition } from '../scene/camera';
import { controls, keepAboveFlatGround } from '../scene/controls';
import { EYE_HEIGHT_METERS, WalkMode } from '../scene/walkMode';
import { grid } from '../scene/grid';
import type { GumballTarget } from '../scene/Gumball';
import type { SharedViewportRenderer } from '../scene/sharedViewportRenderer';
import { buildRampUniformArrays, MAX_COLOR_STOPS, type ColorStop } from '../planet/colorRamp';
import type { TerrainPatch } from '../planet/patch';
import { ChunkPatchRenderer, type BakeChunkPatch } from './ChunkPatchRenderer';
import { chunkBaseDepth } from './chunkPatchMesh';
import { groundHeightAt, raycastGround, type ChunkGround } from './chunkGround';
import type { ElevationData } from './chunkGrid';
import { createChunkWater, setChunkWaterLight, setChunkWaterSky, updateChunkWater, updateChunkWaterFrame, type ChunkWater } from './chunkWater';
import { WATER_SKY_COLOR, type WaterSettings } from '../planet/planetControls';
import type { AtmosphereSettings } from '../atmosphere/atmosphereSettings';
import { createSkyDome, updateSkyDome, updateSkyDomeFrame, type SkyDome } from '../atmosphere/skyDome';
import { landRampFloor } from '../planet/seaLevel';
import { MAX_WAVE_WIND } from '../planet/oceanSpectrum';

const chunkFragmentGlsl = terrainGlsl + hazeGlsl + chunkFragmentBody;

// For the single shared gumball (scene/sharedGumball.ts) to target this
// view's camera when the land-chunk pane is selected — see ISSUES.md,
// 2026-09-23.
export interface LandChunkCanvasHandle {
  getGumballTarget(): GumballTarget | null;
}

interface LandChunkCanvasProps {
  geometry: THREE.BufferGeometry | null;
  // Shared with the planet's own Scene controls (Dana, 2026-09-23 — lighting
  // shouldn't be a separate, independent setting per viewport), not this
  // component's own state. Used raw, not tied to this patch's real position
  // on the sphere — see the lighting effect below.
  ambientLight: number;
  lightDirX: number;
  lightDirY: number;
  lightDirZ: number;
  lightIntensity: number;
  specularStrength: number;
  shininess: number;
  diffuseWrap: number;
  gridSpacing: number;
  gridVisible: boolean;
  walkFieldOfView: number;
  // Shared with the planet's own "Base color" control (Dana, 2026-09-23 —
  // "there are color controls," this shouldn't have its own disconnected one).
  baseColor: string;
  // This patch's own raw elevation, for the color ramp and shadow march to
  // sample — built in voxel/landChunk.ts alongside the geometry itself.
  heightMap: THREE.Texture | null;
  // heightMap's own resolution (a GPU render-region target now, not a fixed
  // 1024x512 map), so the fragment shader's gradient-based normal (see
  // chunk.frag.glsl) samples at the right texel spacing for whatever
  // resolution this particular patch actually baked at. See ISSUES.md, [B32].
  heightMapResolution: number;
  chunkSize: number;
  maxHeight: number;
  colorByElevation: boolean;
  colorStops: ColorStop[];
  // This patch's own real low and high, in raw elevation units — the color
  // ramp spans this range, not a guessed or fixed-anchor one. See
  // voxel/landChunk.ts and shaders/terrain/terrain.glsl.
  elevationMin: number;
  elevationMax: number;
  shadowsEnabled: boolean;
  // Smooth mode's heightMap is now the planet's own GPU bake format
  // (elevation in the texture's green channel, the shared renderer makes
  // handing that texture across valid, see ISSUES.md [B32]); voxel mode's
  // is still a plain single-channel CPU texture (red channel), its own
  // separate, accepted ceiling, untouched by this. True for smooth, false
  // for voxel — see voxel/landChunk.ts, which already knows which style is
  // active.
  heightMapGreenChannel: boolean;
  // This pane's own element (App.tsx's .land-chunk-viewport div) — see
  // SceneCanvas.tsx's identical viewportRef/sharedRenderer props for why.
  viewportRef: RefObject<HTMLDivElement | null>;
  sharedRenderer: SharedViewportRenderer;
  // The smooth style's patches: which ground, when to re-bake, how sharp, and how to bake.
  patch: TerrainPatch;
  patchesEnabled: boolean;
  bakeVersion: number;
  maxErrorPixels: number;
  bakePatch: BakeChunkPatch;
  // The CPU copy of the chunk's heights, for picking the ground and staying above it.
  groundHeights: ElevationData | null;
  // Sea level and water look, shared with the planet, and the planet's lowest height for the depth scale.
  water: WaterSettings;
  waterDeepest: number;
  atmosphere: AtmosphereSettings;
  // The light turns with the camera instead of staying fixed (scene/sceneControls.ts).
  lightFollowsCamera: boolean;
}

// TODO(DS): arbitrary — framing distance for a ~16-unit chunk, unrelated to
// the planet's own DEFAULT_CAMERA_DISTANCE (calibrated for a much bigger scene).
const CHUNK_CAMERA_DISTANCE = 40;

// A second, independent 3D view for inspecting one voxel land-cube chunk,
// alongside the planet — reuses the same renderer/camera/controls helpers
// as SceneCanvas.tsx, since none of them are planet-specific. No custom
// shader needed: culled-face geometry already renders blocky with a plain
// material, since faces don't share vertices across differently-oriented
// cube faces. No gumball here — there's one shared instance for the whole
// viewport (scene/sharedGumball.ts), mounted once and retargeted rather
// than one instance per canvas. See ROADMAP.md, Stage 07.
export const LandChunkCanvas = forwardRef<LandChunkCanvasHandle, LandChunkCanvasProps>(function LandChunkCanvas(
  {
    geometry,
    ambientLight,
    lightDirX,
    lightDirY,
    lightDirZ,
    lightIntensity,
    specularStrength,
    shininess,
    diffuseWrap,
    gridSpacing,
    gridVisible,
    walkFieldOfView,
    baseColor,
    heightMap,
    heightMapResolution,
    chunkSize,
    maxHeight,
    colorByElevation,
    colorStops,
    elevationMin,
    elevationMax,
    shadowsEnabled,
    heightMapGreenChannel,
    viewportRef,
    sharedRenderer,
    patch,
    patchesEnabled,
    bakeVersion,
    maxErrorPixels,
    bakePatch,
    groundHeights,
    water,
    waterDeepest,
    atmosphere,
    lightFollowsCamera,
  },
  handleRef,
) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const skyRef = useRef<SkyDome | null>(null);
  // Read every frame by the sky (wind and sun), so it follows the latest settings without rebuilding the scene.
  const atmosphereRef = useRef(atmosphere);
  atmosphereRef.current = atmosphere;
  const sunDirectionRef = useRef(new THREE.Vector3(1, 1, 1));
  const lightFollowsCameraRef = useRef(lightFollowsCamera);
  lightFollowsCameraRef.current = lightFollowsCamera;
  const frameLight = new THREE.Vector3();
  const waterRef = useRef<ChunkWater | null>(null);
  const gridMeshRef = useRef<THREE.Mesh | null>(null);
  // The setup effect below runs once, so it reads the shared renderer through a ref (the renderer
  // is created after mount and arrives as new state).
  const sharedRendererRef = useRef(sharedRenderer);
  sharedRendererRef.current = sharedRenderer;
  const gumballTargetRef = useRef<GumballTarget | null>(null);
  const walkFovRef = useRef(walkFieldOfView); // vertical field of view while walking, degrees
  const patchRendererRef = useRef<ChunkPatchRenderer | null>(null);
  // Read each frame by the patch renderer, so onFrame never goes stale.
  const patchSettingsRef = useRef({ maxErrorPixels, maxHeight, chunkSize, bakePatch, groundHeights });
  patchSettingsRef.current = { maxErrorPixels, maxHeight, chunkSize, bakePatch, groundHeights };

  useImperativeHandle(
    handleRef,
    () => ({
      getGumballTarget() {
        return gumballTargetRef.current;
      },
    }),
    [],
  );

  useEffect(() => {
    walkFovRef.current = walkFieldOfView;
  }, [walkFieldOfView]);

  useEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) return;

    const perspectiveCamera = camera((viewportElement.clientWidth || 1) / (viewportElement.clientHeight || 1));
    perspectiveCamera.position.copy(defaultCameraPosition(CHUNK_CAMERA_DISTANCE));
    perspectiveCamera.lookAt(0, 0, 0);
    // Listens on this pane's own element, not a canvas — see SceneCanvas.tsx's
    // identical setup for why, scene/sharedViewportRenderer.ts owns the one
    // shared <canvas> now.
    const orbitControls = controls(perspectiveCamera, viewportElement);
    // Map-style navigation ([B56]): zoom toward the cursor, with the orbit target kept on the ground plane.
    orbitControls.zoomToCursor = true;
    orbitControls.screenSpacePanning = false;
    gumballTargetRef.current = {
      camera: perspectiveCamera,
      cameraControls: orbitControls,
      referenceDistance: CHUNK_CAMERA_DISTANCE,
      // Zoom by log distance from the ground pivot, down to a share of the chunk's size.
      surface: () => ({ planetRadius: patchSettingsRef.current.chunkSize, surfaceRadius: 0 }),
      pivotToGround: () => pivotAtScreenPoint(0, 0),
      toggleWalkMode: () => {
        if (walkMode.active) {
          walkMode.exit();
          return false;
        }
        return enterWalk();
      },
      isWalking: () => walkMode.active,
    };

    // Walk mode ([walkMode.ts]): entering saves the orbit camera and turns orbit off; leaving restores it.
    const orbitSaved = { position: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3(), fov: 60, near: 0.1, far: 1000 };
    const walkMode = new WalkMode(perspectiveCamera, viewportElement, () => currentGround(), (x, z) => {
      const renderer = sharedRendererRef.current.renderer;
      return renderer ? patchRenderer.sampleHeight(renderer, x, z, Math.max(0, patchSettingsRef.current.maxHeight)) : null;
    }, () => (water.mesh.visible ? water.mesh.position.y : null), () => {
      perspectiveCamera.position.copy(orbitSaved.position);
      perspectiveCamera.up.copy(orbitSaved.up);
      orbitControls.target.copy(orbitSaved.target);
      perspectiveCamera.lookAt(orbitSaved.target);
      perspectiveCamera.fov = orbitSaved.fov;
      perspectiveCamera.near = orbitSaved.near;
      perspectiveCamera.far = orbitSaved.far;
      perspectiveCamera.updateProjectionMatrix();
      orbitControls.enabled = true;
    });
    function enterWalk(): boolean {
      const ground = currentGround();
      if (!ground) return false;
      orbitSaved.position.copy(perspectiveCamera.position);
      orbitSaved.target.copy(orbitControls.target);
      orbitSaved.up.copy(perspectiveCamera.up);
      orbitSaved.fov = perspectiveCamera.fov;
      orbitSaved.near = perspectiveCamera.near;
      orbitSaved.far = perspectiveCamera.far;
      // Start on the ground under the orbit pivot, facing the way the orbit camera looked.
      const lookX = orbitControls.target.x - perspectiveCamera.position.x;
      const lookZ = orbitControls.target.z - perspectiveCamera.position.z;
      orbitControls.enabled = false;
      walkMode.enter(orbitControls.target.x, orbitControls.target.z, Math.atan2(-lookX, -lookZ));
      if (!walkMode.active) orbitControls.enabled = true;
      return walkMode.active;
    }

    function currentGround(): ChunkGround | null {
      const settings = patchSettingsRef.current;
      return settings.groundHeights ? { heights: settings.groundHeights, chunkSize: settings.chunkSize, maxHeight: Math.max(0, settings.maxHeight) } : null;
    }
    // Before a drag or wheel zoom, the pivot moves to the ground under the cursor
    // (Cesium picks the terrain), kept on the view line so the view doesn't jump.
    const pickRay = new THREE.Raycaster();
    const pickPointer = new THREE.Vector2();
    const viewDirection = new THREE.Vector3();
    // The screen point is in -1..1 view coordinates; (0, 0) is the view's center.
    function pivotAtScreenPoint(screenX: number, screenY: number) {
      const ground = currentGround();
      if (!ground) return;
      pickPointer.set(screenX, screenY);
      pickRay.setFromCamera(pickPointer, perspectiveCamera);
      const hit = raycastGround(ground, pickRay.ray, ground.chunkSize * 4);
      if (!hit) return;
      perspectiveCamera.getWorldDirection(viewDirection);
      orbitControls.target.copy(perspectiveCamera.position).addScaledVector(viewDirection, perspectiveCamera.position.distanceTo(hit));
    }
    function pivotOnGround(event: PointerEvent | WheelEvent) {
      if (walkMode.active || isSpaceHeld) return;
      const rect = viewportElement!.getBoundingClientRect();
      pivotAtScreenPoint(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    }
    viewportElement.addEventListener('pointerdown', pivotOnGround, { capture: true });
    // TEMP [B55]: Alt+click logs heights in a row across the cursor (drawn bake and its patch depth, then the coarse CPU copy).
    function logCliffRow(event: PointerEvent) {
      if (!event.altKey) return;
      const ground = currentGround();
      const renderer = sharedRendererRef.current.renderer;
      if (!ground || !renderer) return;
      const rect = viewportElement!.getBoundingClientRect();
      pickPointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      pickRay.setFromCamera(pickPointer, perspectiveCamera);
      const hit = raycastGround(ground, pickRay.ray, ground.chunkSize * 4);
      if (!hit) return console.log('[TEMP B55] no hit');
      const right = new THREE.Vector3().setFromMatrixColumn(perspectiveCamera.matrixWorld, 0).setY(0).normalize();
      const span = ground.chunkSize * 0.01;
      const rows = [];
      for (let i = -10; i <= 10; i++) {
        const x = hit.x + right.x * span * (i / 10);
        const z = hit.z + right.z * span * (i / 10);
        const drawn = patchRenderer.sampleHeight(renderer, x, z, Math.max(0, patchSettingsRef.current.maxHeight));
        rows.push({ meters: Math.round(span * (i / 10) * 1000), drawnM: drawn === null ? null : +(drawn * 1000).toFixed(1), depth: patchRenderer.lastSampleDepth, coarseM: +((groundHeightAt(ground, x, z) ?? NaN) * 1000).toFixed(1) });
      }
      console.log('[TEMP B55] row across the cursor, left to right, at', hit.toArray());
      console.table(rows);
    }
    viewportElement.addEventListener('pointerdown', logCliffRow);
    viewportElement.addEventListener('wheel', pivotOnGround, { capture: true });

    // Hold Space and drag to pan, as in Figma and Photoshop. Only over this pane and not while typing; released
    // when the window loses focus, the known cause of Figma's "stuck spacebar".
    let isSpaceHeld = false;
    let isPointerOver = false;
    function setSpaceHeld(held: boolean) {
      if (isSpaceHeld === held) return;
      isSpaceHeld = held;
      orbitControls.mouseButtons.LEFT = held ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      viewportElement!.style.cursor = held ? 'grab' : '';
    }
    function handleSpaceKey(event: KeyboardEvent) {
      if (event.code !== 'Space' || walkMode.active) return;
      if (event.type === 'keyup') {
        setSpaceHeld(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      const isTyping = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (isTyping || !isPointerOver) return;
      event.preventDefault(); // no page scroll or focused-button press
      setSpaceHeld(true);
    }
    const releaseSpace = () => setSpaceHeld(false);
    const markPointerOver = () => (isPointerOver = true);
    const markPointerOut = () => (isPointerOver = false);
    window.addEventListener('keydown', handleSpaceKey);
    window.addEventListener('keyup', handleSpaceKey);
    window.addEventListener('blur', releaseSpace);
    viewportElement.addEventListener('pointerenter', markPointerOver);
    viewportElement.addEventListener('pointerleave', markPointerOut);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const gridMesh = grid(gridSpacing);
    gridMesh.visible = gridVisible;
    scene.add(gridMesh);
    gridMeshRef.current = gridMesh;

    // The chunk material: the voxel mesh draws with it, and every patch shares its uniforms.
    const initialRamp = buildRampUniformArrays(colorStops);
    const material = new THREE.ShaderMaterial({
      vertexShader: chunkVertexGlsl,
      fragmentShader: chunkFragmentGlsl,
      side: THREE.DoubleSide,
      uniforms: {
        uBaseColor: { value: new THREE.Color(baseColor) },
        uLightDirection: { value: new THREE.Vector3(lightDirX, lightDirY, lightDirZ) },
        uAmbient: { value: ambientLight },
        uLightIntensity: { value: lightIntensity },
        uSpecularStrength: { value: specularStrength },
        uShininess: { value: shininess },
        uDiffuseWrap: { value: diffuseWrap },
        uCameraPosition: { value: new THREE.Vector3() },
        uHazeColor: { value: new THREE.Color() },
        uHazeSkyColor: { value: new THREE.Color() },
        uHazeDensity: { value: 0 },
        uHazeStart: { value: 0 },
        uHeightMap: { value: heightMap },
        uHeightMapTexelSize: { value: 1 / Math.max(1, heightMapResolution) },
        uChunkHeightMap: { value: heightMap },
        uChunkSize: { value: chunkSize },
        uPatchWorldSize: { value: chunkSize },
        uPatchUvMin: { value: new THREE.Vector2(0, 0) },
        uPatchUvMax: { value: new THREE.Vector2(1, 1) },
        uGradientStepUv: { value: 32 / 1024 },
        uBakeSamples: { value: 0 },
        uBorderTexels: { value: 0 },
        uMaxHeight: { value: maxHeight },
        uColorByElevation: { value: colorByElevation ? 1 : 0 },
        uRampColors: { value: initialRamp.colors },
        uRampPositions: { value: initialRamp.positions },
        uRampCount: { value: initialRamp.count },
        uElevationMin: { value: elevationMin },
        uElevationMax: { value: elevationMax },
        uShadowsEnabled: { value: shadowsEnabled ? 1 : 0 },
        uHeightMapGreenChannel: { value: heightMapGreenChannel ? 1 : 0 },
      },
    });
    materialRef.current = material;
    const patchRenderer = new ChunkPatchRenderer(material);
    patchRenderer.group.visible = false;
    scene.add(patchRenderer.group);
    patchRendererRef.current = patchRenderer;
    const water = createChunkWater();
    scene.add(water.mesh);
    waterRef.current = water;
    const sky = createSkyDome();
    scene.add(sky.mesh);
    skyRef.current = sky;
    const patchFrustum = new THREE.Frustum();
    const patchViewMatrix = new THREE.Matrix4();

    let lastFrameTime = performance.now();
    function onFrame() {
      const now = performance.now();
      const deltaSeconds = Math.min(0.1, (now - lastFrameTime) / 1000);
      lastFrameTime = now;
      if (walkMode.active) {
        // The lens eases with the fly-in: near follows the eye height (a quarter of it, as
        // keepAboveFlatGround does) and far stops past the chunk, blended from the orbit values.
        const walkNear = (EYE_HEIGHT_METERS / 1000) * 0.25;
        const progress = walkMode.progress;
        const fov = THREE.MathUtils.lerp(orbitSaved.fov, walkFovRef.current, progress);
        const near = orbitSaved.near * (walkNear / orbitSaved.near) ** progress;
        const far = THREE.MathUtils.lerp(orbitSaved.far, patchSettingsRef.current.chunkSize * 3, progress);
        if (perspectiveCamera.fov !== fov || perspectiveCamera.near !== near || perspectiveCamera.far !== far) {
          perspectiveCamera.fov = fov;
          perspectiveCamera.near = near;
          perspectiveCamera.far = far;
          perspectiveCamera.updateProjectionMatrix();
        }
        walkMode.update(deltaSeconds);
      } else {
        orbitControls.update();
        const ground = currentGround();
        const groundHeight = ground ? groundHeightAt(ground, perspectiveCamera.position.x, perspectiveCamera.position.z) : null;
        keepAboveFlatGround(orbitControls, perspectiveCamera, groundHeight ?? 0, patchSettingsRef.current.chunkSize);
      }
      // Same reason as SceneCanvas's own onFrame: the specular term needs
      // the eye position, and the camera moves every frame under orbit
      // controls.
      material.uniforms.uCameraPosition.value.copy(perspectiveCamera.position);
      // The Scene light, turned with the camera when it follows it, for the ground, the water and the sky.
      frameLight.copy(sunDirectionRef.current);
      if (lightFollowsCameraRef.current) frameLight.applyQuaternion(perspectiveCamera.quaternion);
      material.uniforms.uLightDirection.value.copy(frameLight);
      // Haze starts at the orbit point; when walking it starts at the eye.
      const hazeStart = walkMode.active ? 0 : perspectiveCamera.position.distanceTo(orbitControls.target);
      material.uniforms.uHazeStart.value = hazeStart;
      water.mesh.material.uniforms.uHazeStart.value = hazeStart;
      (water.mesh.material.uniforms.uLightDirection.value as THREE.Vector3).copy(frameLight);
      updateSkyDomeFrame(sky, perspectiveCamera, frameLight, atmosphereRef.current.wind, deltaSeconds);
      updateChunkWaterFrame(water, perspectiveCamera.position, deltaSeconds, viewportElement!.clientWidth * window.devicePixelRatio);
      if (!patchRenderer.group.visible) return;
      const settings = patchSettingsRef.current;
      perspectiveCamera.updateMatrixWorld();
      patchViewMatrix.multiplyMatrices(perspectiveCamera.projectionMatrix, perspectiveCamera.matrixWorldInverse);
      patchFrustum.setFromProjectionMatrix(patchViewMatrix);
      patchRenderer.update(
        perspectiveCamera,
        {
          maxErrorPixels: settings.maxErrorPixels,
          viewHeightPixels: Math.max(1, viewportElement!.clientHeight),
          fieldOfViewRadians: THREE.MathUtils.degToRad(perspectiveCamera.fov),
          frustum: patchFrustum,
          chunkSize: settings.chunkSize,
          minHeight: chunkBaseDepth(settings.chunkSize),
          maxHeight: Math.max(settings.maxHeight, 0),
        },
        settings.bakePatch,
        sharedRendererRef.current.renderer?.capabilities.maxTextureSize ?? 2048,
      );
    }
    sharedRenderer.registerView('landChunk', { scene, camera: perspectiveCamera, elementRef: viewportRef, onFrame });

    return () => {
      viewportElement.removeEventListener('pointerdown', pivotOnGround, { capture: true });
      viewportElement.removeEventListener('pointerdown', logCliffRow); // TEMP [B55]
      window.removeEventListener('keydown', handleSpaceKey);
      window.removeEventListener('keyup', handleSpaceKey);
      window.removeEventListener('blur', releaseSpace);
      viewportElement.removeEventListener('pointerenter', markPointerOver);
      viewportElement.removeEventListener('pointerleave', markPointerOut);
      viewportElement.removeEventListener('wheel', pivotOnGround, { capture: true });
      sharedRenderer.unregisterView('landChunk');
      walkMode.dispose();
      orbitControls.dispose();
      patchRenderer.dispose();
      material.dispose();
      water.dispose();
      waterRef.current = null;
      sky.dispose();
      skyRef.current = null;
      patchRendererRef.current = null;
      sceneRef.current = null;
      gridMeshRef.current = null;
      materialRef.current = null;
      gumballTargetRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewportRef is a stable ref object; sharedRenderer.registerView/unregisterView get new identities every parent render but only need calling once at mount/unmount
  }, []);

  // Lighting — the Scene controls now mean exactly what they mean on the
  // planet, because both go through the same model (shaders/terrain/chunk.frag.glsl
  // and shaders/terrain/fragment.glsl). The old rescaling multipliers are gone with
  // the standard material that needed them.
  //
  // Deliberately NOT rotated into the patch's own real position on the
  // sphere (tried briefly, 2026-10-19/20, then reverted) — the chunk is an
  // inspection view, not a simulation of that exact spot's real day/night
  // side, and a patch can legitimately face away from the sun.
  // Dana: "it's located somewhere in space so it really doesn't matter...
  // the chunk should always have light on it, but i should be able to tweak
  // the lighting settings." Raw direction keeps the Scene panel's sliders
  // behaving the same, predictable way here as on the planet.
  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uAmbient.value = ambientLight;
    material.uniforms.uLightIntensity.value = lightIntensity;
    material.uniforms.uSpecularStrength.value = specularStrength;
    material.uniforms.uShininess.value = shininess;
    material.uniforms.uDiffuseWrap.value = diffuseWrap;
    material.uniforms.uLightDirection.value.set(lightDirX, lightDirY, lightDirZ);
    sunDirectionRef.current.set(lightDirX, lightDirY, lightDirZ);
    if (waterRef.current) setChunkWaterLight(waterRef.current, new THREE.Vector3(lightDirX, lightDirY, lightDirZ), ambientLight, lightIntensity);
  }, [ambientLight, lightIntensity, specularStrength, shininess, diffuseWrap, lightDirX, lightDirY, lightDirZ]);

  // Base color — shared with the planet's own ColorPicker, not a separate
  // hardcoded placeholder.
  useEffect(() => {
    materialRef.current?.uniforms.uBaseColor.value.set(baseColor);
  }, [baseColor]);

  // Elevation color ramp + shadows — live uniform updates so toggling
  // either doesn't force a new mesh. The heightmap texture itself only
  // actually changes when geometry does (both are built together in
  // landChunk.ts), but it's set here too since a fresh material (built in
  // the geometry effect below) needs it just as much as an existing one
  // picking up a later texture swap.
  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uHeightMap.value = heightMap;
    material.uniforms.uHeightMapTexelSize.value = 1 / Math.max(1, heightMapResolution);
    material.uniforms.uChunkHeightMap.value = heightMap;
    material.uniforms.uChunkSize.value = chunkSize;
    material.uniforms.uPatchWorldSize.value = chunkSize;
    material.uniforms.uMaxHeight.value = maxHeight;
    material.uniforms.uColorByElevation.value = colorByElevation ? 1 : 0;
    const ramp = buildRampUniformArrays(colorStops);
    const rampColors = material.uniforms.uRampColors.value as THREE.Color[];
    for (let i = 0; i < MAX_COLOR_STOPS; i++) rampColors[i].copy(ramp.colors[i]);
    (material.uniforms.uRampPositions.value as number[]).splice(0, MAX_COLOR_STOPS, ...ramp.positions);
    material.uniforms.uRampCount.value = ramp.count;
    // With water on, the land ramp starts at the depth light reaches, as on the planet.
    material.uniforms.uElevationMin.value = water.enabled
      ? Math.max(elevationMin, landRampFloor(water.seaLevel, waterDeepest, water.clarity))
      : elevationMin;
    material.uniforms.uElevationMax.value = elevationMax;
    material.uniforms.uShadowsEnabled.value = shadowsEnabled ? 1 : 0;
    material.uniforms.uHeightMapGreenChannel.value = heightMapGreenChannel ? 1 : 0;
  }, [
    heightMap,
    heightMapResolution,
    chunkSize,
    maxHeight,
    colorByElevation,
    baseColor,
    colorStops,
    elevationMin,
    elevationMax,
    shadowsEnabled,
    heightMapGreenChannel,
    water.enabled,
    water.seaLevel,
    water.clarity,
    waterDeepest,
  ]);

  // The water sheet (Seascape): placed at sea level over the chunk, reading the same height texture as the ground.
  useEffect(() => {
    const chunkWater = waterRef.current;
    if (!chunkWater) return;
    updateChunkWater(chunkWater, water, chunkSize, maxHeight, waterDeepest, heightMap, heightMapGreenChannel, Math.min(atmosphere.wind, MAX_WAVE_WIND));
    chunkWater.mesh.visible = water.enabled && heightMap !== null;
  }, [water, waterDeepest, heightMap, heightMapGreenChannel, chunkSize, maxHeight, atmosphere.wind]);

  // The atmosphere: the sky dome, and the haze the ground and water fade into (shaders/atmosphere/haze.glsl). Haze 1 halves
  // the color half a chunk width past the orbit point at height 0 (1 - e^-0.69 is 0.5); less higher up. Inferred, TUNABLE.
  useEffect(() => {
    const hazeDensity = atmosphere.enabled ? (atmosphere.haze * Math.LN2) / (0.5 * Math.max(chunkSize, 0.0001)) : 0;
    if (skyRef.current) updateSkyDome(skyRef.current, atmosphere);
    const material = materialRef.current;
    if (material) {
      (material.uniforms.uHazeColor.value as THREE.Color).set(atmosphere.horizonColor);
      (material.uniforms.uHazeSkyColor.value as THREE.Color).set(atmosphere.zenithColor);
      material.uniforms.uHazeDensity.value = hazeDensity;
    }
    if (waterRef.current) setChunkWaterSky(waterRef.current, atmosphere.enabled ? atmosphere.horizonColor : WATER_SKY_COLOR, atmosphere.horizonColor, atmosphere.zenithColor, hazeDensity);
  }, [atmosphere, chunkSize]);

  // Grid spacing/visibility — mirrors SceneCanvas's own grid effect (rebuild
  // on spacing change, since cell size is baked into a shader uniform).
  useEffect(() => {
    const scene = sceneRef.current;
    const oldGrid = gridMeshRef.current;
    if (!scene || !oldGrid) return;
    scene.remove(oldGrid);
    oldGrid.geometry.dispose();
    (oldGrid.material as THREE.Material).dispose();

    const newGrid = grid(gridSpacing);
    newGrid.visible = gridVisible;
    scene.add(newGrid);
    gridMeshRef.current = newGrid;
  }, [gridSpacing, gridVisible]);

  // Swaps in the generated chunk mesh whenever a new geometry arrives. The
  // material is built once (below) and kept for the component's whole
  // lifetime — every later geometry change only swaps the mesh's geometry,
  // it doesn't touch the material at all. Recreating a ShaderMaterial on
  // every geometry change (every Resolution-slider tick) forced a shader
  // recompile each time, the real cause of the chunk's flash-to-flat while
  // dragging that slider — see ISSUES.md, [B32].
  // The voxel style's single mesh; the smooth style passes no geometry.
  useEffect(() => {
    const scene = sceneRef.current;
    const material = materialRef.current;
    if (!scene || !material) return;
    if (!geometry) {
      if (meshRef.current) scene.remove(meshRef.current);
      meshRef.current = null;
      return;
    }
    if (meshRef.current) {
      meshRef.current.geometry = geometry;
      return;
    }
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;
  }, [geometry]);

  // The smooth style's patches: rebuilt for a new spot or size, re-baked when the terrain changes.
  useEffect(() => {
    const patchRenderer = patchRendererRef.current;
    if (!patchRenderer) return;
    patchRenderer.group.visible = patchesEnabled;
    if (!patchesEnabled) {
      patchRenderer.clear();
      return;
    }
    patchRenderer.configure(patch, chunkSize, chunkBaseDepth(chunkSize));
  }, [patchesEnabled, patch, chunkSize]);

  useEffect(() => {
    if (patchesEnabled) patchRendererRef.current?.rebakeAll(bakePatch);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-bakes only when the terrain changes
  }, [bakeVersion]);

  return null;
});
