import { useEffect, useImperativeHandle, useRef, forwardRef, type RefObject } from 'react';
import * as THREE from 'three';
import chunkVertexGlsl from '../shaders/terrain/chunk.vert.glsl?raw';
import chunkFragmentBody from '../shaders/terrain/chunk.frag.glsl?raw';
import terrainGlsl from '../shaders/terrain/terrain.glsl?raw';
import landLayersGlsl from '../shaders/terrain/landLayers.glsl?raw';
import noiseGlsl from '../shaders/heightmap/noise.glsl?raw'; // the life layers' patterns
import lifeLayersGlsl from '../shaders/biome/lifeLayers.glsl?raw';
import hazeGlsl from '../shaders/atmosphere/haze.glsl?raw'; // elevation color ramp + shadow march — shared with fragment.glsl, see shaders/terrain/terrain.glsl
import { camera, defaultCameraPosition, DEFAULT_FAR } from '../scene/camera';
import { controls, keepAboveFlatGround } from '../scene/controls';
import { WalkMode } from '../scene/walkMode';
import { grid } from '../scene/grid';
import type { GumballTarget } from '../scene/Gumball';
import type { SharedViewportRenderer } from '../scene/sharedViewportRenderer';
import { buildRampUniformArrays, MAX_COLOR_STOPS, type ColorStop } from '../planet/colorRamp';
import { patchCenterDirection, type TerrainPatch } from '../planet/patch';
import { LifeGrid } from '../biome/lifeGrid';
import type { DebugView, LifeProgress } from './landChunk';
import { LIFE_SATURATION, landMiddleColor, lifeColors, rangeVector, geneOffset, type BiomeSettings, type Genome } from '../biome/plantTypes';
import { ChunkPatchRenderer, type AdvanceChunkBase, type BakeChunkPatch } from './ChunkPatchRenderer';
import { chunkBaseDepth } from './chunkPatchMesh';
import { groundHeightAt, raycastGround, type ChunkGround } from './chunkGround';
import type { ElevationData } from './chunkGrid';
import { ChunkLakes } from './chunkLakes';
import { squareSizeKm } from './areaSelect';
import { liquidNamed, viscosityAt } from '../rivers/riverClimate';
import { createChunkMap } from './chunkMap';
import { createChunkWater, setChunkWaterLight, setChunkWaterSky, setChunkWaterTide, updateChunkWater, updateChunkWaterFrame, WATER_SHEET_SEGMENTS, type ChunkWater } from './chunkWater';
import { tideHeight } from '../atmosphere/tides';
import { WATER_SKY_COLOR, type RockSettings, type WaterSettings } from '../planet/planetControls';
import { applyRockUniforms, createRockUniforms } from '../planet/planetPatchMesh';
import type { AtmosphereSettings } from '../atmosphere/atmosphereSettings';
import { fillColorFor } from '../scene/fillLight';
import { createSkyDome, setSkyDomeLight, setSkyDomeMoonTexture, updateSkyDome, updateSkyDomeFrame, type SkyDome } from '../atmosphere/skyDome';
import { HeightmapPipeline } from '../map/heightmap';
import { landRampFloor } from '../planet/seaLevel';
import { MAX_WAVE_WIND } from '../planet/oceanSpectrum';

const chunkFragmentGlsl = terrainGlsl + noiseGlsl + landLayersGlsl + lifeLayersGlsl + hazeGlsl + chunkFragmentBody;

// For the single shared gumball (scene/sharedGumball.ts) to target this
// view's camera when the land-chunk pane is selected — see ISSUES.md,
// 2026-09-23.
// How high the haze reaches before thinning by 1/e, as a share of the terrain's height (maxHeight). Inferred, TUNABLE.
const HAZE_SCALE_SHARE = 0.5;
const WALK_MAP_REDRAW_MS = 2000; // how often the walk map is redrawn while walking. Inferred, TUNABLE

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
  shadowHue: number; // the fill's hue turn, degrees (scene/fillLight.ts)
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
  heightBase: number; // drawn height = (raw + heightBase) * maxHeight: the chunk's lowest ground sits at 0
  colorByElevation: boolean;
  colorStops: ColorStop[];
  rock: RockSettings;
  biome: BiomeSettings;
  onLifeProgress: (progress: LifeProgress | null) => void;
  debugView: DebugView;
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
  frameVersion: number;
  maxErrorPixels: number;
  bakePatch: BakeChunkPatch;
  advanceChunkBase: AdvanceChunkBase;
  chunkBaseTexture: () => THREE.Texture | null;
  chunkPreview: () => { target: THREE.WebGLRenderTarget; revision: number } | null;
  lakesOn: boolean;
  radiusKm: number;
  // The CPU copy of the chunk's heights, for picking the ground and staying above it.
  groundHeights: ElevationData | null;
  // Sea level and water look, shared with the planet, and the planet's lowest height for the depth scale.
  water: WaterSettings;
  waterDeepest: number;
  waterClarityShare: number;
  atmosphere: AtmosphereSettings;
  // The light turns with the camera instead of staying fixed (scene/sceneControls.ts).
  lightFollowsCamera: boolean;
}

// The camera keeps a distance ratio to the chunk, not a fixed distance (Dana, 2026-11-03): 40 at the default 16 km.
// It never goes past most of the far plane, which stays fixed: scaling the planes drew flickering black shapes.
const CHUNK_CAMERA_DISTANCE_PER_KM = 2.5;
const CHUNK_CAMERA_MAX_DISTANCE = DEFAULT_FAR * 0.8;
const chunkCameraDistance = (chunkSize: number) => Math.min(CHUNK_CAMERA_DISTANCE_PER_KM * chunkSize, CHUNK_CAMERA_MAX_DISTANCE);
// Each moon's surface map, wider than the planet's 1024 so a large moon stays sharp (about 32 MB a moon). TUNABLE.
const MOON_TEXTURE_WIDTH = 2048;

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
    shadowHue,
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
    heightBase,
    colorByElevation,
    colorStops,
    rock,
    biome,
    onLifeProgress,
    debugView,
    elevationMin,
    elevationMax,
    shadowsEnabled,
    heightMapGreenChannel,
    viewportRef,
    sharedRenderer,
    patch,
    patchesEnabled,
    bakeVersion,
    frameVersion,
    maxErrorPixels,
    bakePatch,
    advanceChunkBase,
    chunkBaseTexture,
    chunkPreview,
    lakesOn,
    radiusKm,
    groundHeights,
    water,
    waterDeepest,
    waterClarityShare,
    atmosphere,
    lightFollowsCamera,
  },
  handleRef,
) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const skyRef = useRef<SkyDome | null>(null);
  // Bakes the moon's surface from its own noise layers (atmosphere/moonTexture.ts), on the shared renderer.
  const moonPipelinesRef = useRef<(HeightmapPipeline | null)[]>([]);
  const moonBakedLayersRef = useRef<unknown[]>([]); // the layers each moon's texture was last baked from
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
  const gridVisibleRef = useRef(gridVisible); // the Scene setting; walk mode hides the grid on top of it
  const patchRendererRef = useRef<ChunkPatchRenderer | null>(null);
  // Read each frame by the patch renderer, so onFrame never goes stale.
  const onLifeProgressRef = useRef(onLifeProgress);
  onLifeProgressRef.current = onLifeProgress;
  const patchSettingsRef = useRef({ maxErrorPixels, maxHeight, heightBase, chunkSize, bakePatch, advanceChunkBase, chunkBaseTexture, chunkPreview, lakesOn, atmosphere, patch, radiusKm, groundHeights, biome, lightFollowsCamera });
  patchSettingsRef.current = { maxErrorPixels, maxHeight, heightBase, chunkSize, bakePatch, advanceChunkBase, chunkBaseTexture, chunkPreview, lakesOn, atmosphere, patch, radiusKm, groundHeights, biome, lightFollowsCamera };

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
    gridVisibleRef.current = gridVisible;
  }, [gridVisible]);

  // A new Size (km): the zoom range and the camera's distance from its pivot scale with it.
  const cameraSizeRef = useRef(chunkSize);
  useEffect(() => {
    const target = gumballTargetRef.current;
    if (!target) return;
    const ratio = chunkSize / cameraSizeRef.current;
    cameraSizeRef.current = chunkSize;
    target.referenceDistance = chunkCameraDistance(chunkSize);
    const { camera: chunkCamera, cameraControls } = target;
    if (ratio !== 1) {
      chunkCamera.position.sub(cameraControls.target).multiplyScalar(ratio).add(cameraControls.target);
      cameraControls.update();
    }
  }, [chunkSize]);

  // A newly drawn square opens framed like Reset View, so the old zoom can't leave the camera inside its terrain.
  const framedVersionRef = useRef(frameVersion);
  useEffect(() => {
    const target = gumballTargetRef.current;
    if (!target || framedVersionRef.current === frameVersion) return;
    framedVersionRef.current = frameVersion;
    target.camera.position.copy(defaultCameraPosition(chunkCameraDistance(chunkSize)));
    target.camera.up.set(0, 1, 0);
    target.cameraControls.target.set(0, 0, 0);
    target.cameraControls.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new square frames; a Size change keeps the view
  }, [frameVersion]);

  useEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) return;

    const perspectiveCamera = camera((viewportElement.clientWidth || 1) / (viewportElement.clientHeight || 1));
    perspectiveCamera.position.copy(defaultCameraPosition(chunkCameraDistance(chunkSize)));
    perspectiveCamera.lookAt(0, 0, 0);
    // Listens on this pane's own element, not a canvas — see SceneCanvas.tsx's
    // identical setup for why, scene/sharedViewportRenderer.ts owns the one
    // shared <canvas> now.
    const orbitControls = controls(perspectiveCamera, viewportElement);
    // Map-style navigation ([B56]): zoom toward the cursor, with the orbit target kept on the ground plane.
    orbitControls.zoomToCursor = true;
    orbitControls.maxDistance = CHUNK_CAMERA_MAX_DISTANCE; // inside the far plane, so a large chunk is never cut off
    orbitControls.screenSpacePanning = false;
    // The walk map (voxel/chunkMap.ts): redrawn every few seconds while walking, so lakes and new patches show.
    const walkMap = createChunkMap();
    let walkMapDrawnAt = -Infinity;
    const walkEuler = new THREE.Euler();
    gumballTargetRef.current = {
      camera: perspectiveCamera,
      cameraControls: orbitControls,
      referenceDistance: chunkCameraDistance(chunkSize),
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
      setEyeHeight: (meters) => {
        walkMode.eyeHeightMeters = meters;
      },
      setWalkSpeed: (multiplier) => {
        walkMode.speedMultiplier = multiplier;
      },
      walkMap: () => {
        if (!walkMode.active) return null;
        walkEuler.setFromQuaternion(perspectiveCamera.quaternion, 'YXZ');
        return { image: walkMap.canvas, x: perspectiveCamera.position.x, z: perspectiveCamera.position.z, yaw: walkEuler.y, chunkSize: patchSettingsRef.current.chunkSize };
      },
      teleport: (x, z) => walkMode.teleport(x, z),
    };

    // Walk mode ([walkMode.ts]): entering saves the orbit camera and turns orbit off; leaving restores it.
    const orbitSaved = { position: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3(), fov: 60, near: 0.1, far: 1000 };
    // The sea or the lake at a point, whichever is higher, in world height (applyTide's rule for the lake); null if none.
    // Both views keep the camera above it, so it never sees the water from underneath.
    function waterHeightAt(x: number, z: number): number | null {
      const size = Math.max(patchSettingsRef.current.chunkSize, 1e-6);
      const u = x / size + 0.5;
      const v = z / size + 0.5;
      const onChunk = u >= 0 && u <= 1 && v >= 0 && v <= 1;
      // The sea counts only where it can reach, not in a dip below it with no way in.
      const seaReaches = !onChunk || chunkLakes.seaReaches(u, v, water.mesh.material.uniforms.uSeaLevel.value as number);
      const sea = water.mesh.visible && seaReaches ? water.mesh.position.y : null;
      const lake = onChunk ? chunkLakes.drawnLevelAt(u, v, WATER_SHEET_SEGMENTS) : null;
      const { heightBase, maxHeight } = patchSettingsRef.current;
      const lakeHeight = lake === null ? null : Math.max(0, lake + heightBase) * Math.max(0, maxHeight);
      return sea === null ? lakeHeight : lakeHeight === null ? sea : Math.max(sea, lakeHeight);
    }
    const walkMode = new WalkMode(perspectiveCamera, viewportElement, () => currentGround(), (x, z) => {
      const renderer = sharedRendererRef.current.renderer;
      return renderer ? patchRenderer.sampleHeight(renderer, x, z, Math.max(0, patchSettingsRef.current.maxHeight), patchSettingsRef.current.heightBase) : null;
    }, waterHeightAt, () => {
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

    // The ground for the cameras, picking and walk mode: the preview map's (chunkLakes.ground) once it has arrived. The
    // separate 257-sample grid was ~8 km off the drawn ground, up to 61 km, so the orbit camera sank into hills
    // (measured 2026-11-04); it stays only as the first frames' stand-in.
    function currentGround(): ChunkGround | null {
      const settings = patchSettingsRef.current;
      const preview = chunkLakes.ground;
      const heights = preview ? { data: preview.data, width: preview.size, height: preview.size } : settings.groundHeights;
      return heights ? { heights, chunkSize: settings.chunkSize, maxHeight: Math.max(0, settings.maxHeight), heightBase: settings.heightBase } : null;
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
        uFillColor: { value: fillColorFor(atmosphere.enabled, atmosphere.zenithColor, shadowHue) },
        uShadeStep: { value: atmosphere.shadeEnabled ? atmosphere.shadeStep : 0 },
        uShadeFeather: { value: atmosphere.shadeFeather },
        uShadeLift: { value: atmosphere.shadeLift },
        uShadeChroma: { value: atmosphere.shadeChroma },
        uShadeHueTurn: { value: shadowHue / 360 },
        uPatchDebug: { value: 0 },
        uPatchColor: { value: new THREE.Color(0.5, 0.5, 0.5) }, // the coarse base mesh; each patch has its own
        uLifeAlgae: { value: null },
        uLifeMoss: { value: null },
        uLifeShore: { value: null },
        uShoreReach: { value: 200 },
        uAlgaeVariantHue: { value: new THREE.Vector4() },
        uAlgaeVariantBrightness: { value: new THREE.Vector4() },
        uMossVariantHue: { value: new THREE.Vector4() },
        uMossVariantBrightness: { value: new THREE.Vector4() },
        uBiomeOn: { value: 0 },
        uAlgaeHue: { value: new THREE.Vector4() },
        uAlgaeShade: { value: new THREE.Vector4() },
        uAlgaeMask: { value: new THREE.Vector4() },
        uAlgaeVelvet: { value: new THREE.Vector4() },
        uMossHue: { value: new THREE.Vector4() },
        uMossShade: { value: new THREE.Vector4() },
        uMossMask: { value: new THREE.Vector4() },
        uMossVelvet: { value: new THREE.Vector4() },
        uLifeClimate: { value: new THREE.Vector4() },
        uLifeSun: { value: new THREE.Vector3(0, 1, 0) },
        uLifeInputs: { value: null },
        uAlgaeTemperature: { value: new THREE.Vector4() },
        uAlgaeMoisture: { value: new THREE.Vector4() },
        uAlgaeSun: { value: new THREE.Vector4() },
        uMossTemperature: { value: new THREE.Vector4() },
        uMossMoisture: { value: new THREE.Vector4() },
        uMossSun: { value: new THREE.Vector4() },
        uLightIntensity: { value: lightIntensity },
        uSpecularStrength: { value: specularStrength },
        uShininess: { value: shininess },
        uDiffuseWrap: { value: diffuseWrap },
        uCameraPosition: { value: new THREE.Vector3() },
        uHazeColor: { value: new THREE.Color() },
        uHazeSkyColor: { value: new THREE.Color() },
        uHazeDensity: { value: 0 },
        uHazeStart: { value: 0 },
        uHazeFloor: { value: 0 },
        uHazeScaleHeight: { value: 1 },
        uHazeLayers: { value: 0 },
        uHeightMap: { value: heightMap },
        uHeightMapTexelSize: { value: 1 / Math.max(1, heightMapResolution) },
        uChunkHeightMap: { value: heightMap },
        uChunkLakeLevels: { value: null },
        uLakeCells: { value: 0 },
        uChunkSize: { value: chunkSize },
        uPatchWorldSize: { value: chunkSize },
        uPatchUvMin: { value: new THREE.Vector2(0, 0) },
        uPatchUvMax: { value: new THREE.Vector2(1, 1) },
        uGradientStepUv: { value: 32 / 1024 },
        uBakeSamples: { value: 0 },
        uMorphStart: { value: 0 }, // per patch (ChunkPatchRenderer); 0 here leaves the voxel mesh unblended
        uMorphEnd: { value: 0 },
        uEdgeFiner: { value: new THREE.Vector4(0, 0, 0, 0) }, // per patch (ChunkPatchRenderer); edges facing a finer neighbor
        uBorderTexels: { value: 0 },
        uMaxHeight: { value: maxHeight },
        uHeightBase: { value: heightBase },
        uWaterOn: { value: 0 },
        uSeaLevel: { value: 0 },
        uColorByElevation: { value: colorByElevation ? 1 : 0 },
        uRampColors: { value: initialRamp.colors },
        uRampPositions: { value: initialRamp.positions },
        uRampCount: { value: initialRamp.count },
        ...createRockUniforms(rock),
        uElevationMin: { value: elevationMin },
        uElevationMax: { value: elevationMax },
        uShadowsEnabled: { value: shadowsEnabled ? 1 : 0 },
        uHeightMapGreenChannel: { value: heightMapGreenChannel ? 1 : 0 },
      },
    });
    materialRef.current = material;

    // The life grid (biome/lifeGrid.ts): regrown from bare ground when its inputs change, 150 ms after they settle.
    const lifeGrid = new LifeGrid();
    let lifeStartMs = 0;
    // The run's progress with the time left from its pace so far, as the river carving's bar does.
    const reportLife = (share: number | null) => {
      if (share === null) return onLifeProgressRef.current(null);
      if (share === 0) lifeStartMs = performance.now();
      const elapsed = (performance.now() - lifeStartMs) / 1000;
      onLifeProgressRef.current({ share, secondsLeft: share > 0.05 ? Math.max(1, Math.round((elapsed / share) * (1 - share))) : null });
    };
    let lifeKey = '';
    let lifeTimer: ReturnType<typeof setTimeout> | undefined;
    const upSun = new THREE.Vector3(0, 1, 0);
    // The grid's current state and its variants' visible genes (hue turn, brightness) into the chunk's uniforms.
    let lifeVariation = 1; // Variation only stretches the visible genes, so it updates here without a regrowth
    function showLife() {
      const u = material.uniforms;
      u.uLifeAlgae.value = lifeGrid.algae;
      u.uLifeMoss.value = lifeGrid.moss;
      const genes = (list: Genome[], gene: 'hueTurn' | 'brightness') => list.map((genome) => geneOffset(genome, gene, lifeVariation)) as [number, number, number, number];
      (u.uAlgaeVariantHue.value as THREE.Vector4).set(...genes(lifeGrid.genomes.algae, 'hueTurn'));
      (u.uAlgaeVariantBrightness.value as THREE.Vector4).set(...genes(lifeGrid.genomes.algae, 'brightness'));
      (u.uMossVariantHue.value as THREE.Vector4).set(...genes(lifeGrid.genomes.moss, 'hueTurn'));
      (u.uMossVariantBrightness.value as THREE.Vector4).set(...genes(lifeGrid.genomes.moss, 'brightness'));
    }
    function updateLife(settings: typeof patchSettingsRef.current) {
      const biome = settings.biome;
      lifeVariation = biome.variation;
      showLife();
      material.uniforms.uLifeInputs.value = lifeGrid.inputs;
      material.uniforms.uLifeShore.value = lifeGrid.shore;
      material.uniforms.uShoreReach.value = biome.shoreReach;
      material.uniforms.uBiomeOn.value = biome.enabled ? 1 : 0;
      const lifeRenderer = sharedRendererRef.current.renderer;
      const heightTexture = material.uniforms.uChunkHeightMap.value as THREE.Texture | null;
      if (!biome.enabled || !lifeRenderer || !heightTexture) return;
      // A light that follows the camera would regrow life on every turn, so life then takes the sun from straight above.
      const sun = settings.lightFollowsCamera ? upSun : (material.uniforms.uLightDirection.value as THREE.Vector3);
      const atmosphere = settings.atmosphere;
      const growth = [biome.years, biome.growthRate, biome.deathRate, biome.algae.temperature, biome.algae.moisture, biome.algae.sun, biome.moss.temperature, biome.moss.moisture, biome.moss.sun, biome.evolve, biome.seed, biome.mutationRate, biome.shoreReach];
      const key = JSON.stringify([heightTexture.uuid, heightTexture.version, chunkLakes.texture.version, material.uniforms.uSeaLevel.value, material.uniforms.uMaxHeight.value, material.uniforms.uChunkSize.value, material.uniforms.uShadowsEnabled.value, atmosphere.temperature, atmosphere.rainfall, atmosphere.liquid, atmosphere.peakCooling, atmosphere.poleCooling, material.uniforms.uElevationMin.value, material.uniforms.uElevationMax.value, sun.toArray().map((value) => value.toFixed(3)), growth]);
      if (key === lifeKey) return;
      lifeKey = key;
      // Only when they change: the same inputs per pixel (chunk.frag.glsl), so life fills the best spots first.
      const lifeLiquid = liquidNamed(atmosphere.liquid);
      const lifeCenter = settings.patch ? patchCenterDirection(settings.patch) : upSun;
      (material.uniforms.uLifeClimate.value as THREE.Vector4).set(
        atmosphere.temperature,
        atmosphere.peakCooling,
        atmosphere.poleCooling * Math.abs(THREE.MathUtils.clamp(lifeCenter.y, -1, 1)),
        Math.min(atmosphere.rainfall / Math.max(2 * lifeLiquid.typicalRainfall, 1), 1),
      );
      (material.uniforms.uLifeSun.value as THREE.Vector3).copy(sun);
      clearTimeout(lifeTimer);
      lifeTimer = setTimeout(() => {
        const liquid = liquidNamed(atmosphere.liquid);
        const center = settings.patch ? patchCenterDirection(settings.patch) : upSun;
        void lifeGrid.run(lifeRenderer, {
          heightMap: heightTexture,
          heightMapGreenChannel: material.uniforms.uHeightMapGreenChannel.value > 0.5,
          heightMapSize: (heightTexture.image as { width?: number } | undefined)?.width ?? 512,
          lakeLevels: chunkLakes.texture,
          seaLevel: material.uniforms.uSeaLevel.value as number,
          maxHeight: material.uniforms.uMaxHeight.value as number,
          chunkSize: material.uniforms.uChunkSize.value as number,
          temperature: atmosphere.temperature,
          peakCooling: atmosphere.peakCooling,
          elevationMin: material.uniforms.uElevationMin.value as number,
          elevationMax: material.uniforms.uElevationMax.value as number,
          poleCooling: atmosphere.poleCooling,
          latitude: Math.asin(THREE.MathUtils.clamp(center.y, -1, 1)),
          rainShare: Math.min(atmosphere.rainfall / Math.max(2 * liquid.typicalRainfall, 1), 1),
          sunDirection: sun.clone(),
          shadowsEnabled: material.uniforms.uShadowsEnabled.value > 0.5,
        }, biome, showLife, reportLife);
      }, 150);
    }
    const patchRenderer = new ChunkPatchRenderer(material);
    patchRenderer.group.visible = false;
    scene.add(patchRenderer.group);
    patchRendererRef.current = patchRenderer;
    const water = createChunkWater();
    const chunkLakes = new ChunkLakes();
    material.uniforms.uChunkLakeLevels.value = chunkLakes.texture;
    water.mesh.material.uniforms.uChunkLakeLevels.value = chunkLakes.texture;
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
      // An editor helper: hidden while walking, or it shows through the see-through water.
      if (gridMeshRef.current) gridMeshRef.current.visible = gridVisibleRef.current && !walkMode.active;
      if (walkMode.active) {
        // The lens eases with the fly-in: near follows the eye height (a quarter of it, as
        // keepAboveFlatGround does) and far stops past the chunk, blended from the orbit values.
        const walkNear = (walkMode.eyeHeightMeters / 1000) * 0.25;
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
        const mapRenderer = sharedRendererRef.current.renderer;
        if (mapRenderer && walkMode.progress >= 1 && performance.now() - walkMapDrawnAt > WALK_MAP_REDRAW_MS) {
          walkMapDrawnAt = performance.now();
          // Seen from above: the eye is the map's camera and there is no haze, then both go back for the view.
          walkMap.render(mapRenderer, scene, patchSettingsRef.current.chunkSize, Math.max(patchSettingsRef.current.maxHeight, 1) * 2, (eye) => {
            const uniformSets = [material.uniforms, water.mesh.material.uniforms];
            const saved = uniformSets.map((uniforms) => ({ eye: (uniforms.uCameraPosition.value as THREE.Vector3).clone(), haze: uniforms.uHazeDensity.value as number }));
            for (const uniforms of uniformSets) {
              (uniforms.uCameraPosition.value as THREE.Vector3).copy(eye);
              uniforms.uHazeDensity.value = 0;
            }
            return () => uniformSets.forEach((uniforms, i) => {
              (uniforms.uCameraPosition.value as THREE.Vector3).copy(saved[i].eye);
              uniforms.uHazeDensity.value = saved[i].haze;
            });
          });
        }
      } else {
        orbitControls.update();
        const ground = currentGround();
        const groundHeight = ground ? groundHeightAt(ground, perspectiveCamera.position.x, perspectiveCamera.position.z) : null;
        const waterHeight = waterHeightAt(perspectiveCamera.position.x, perspectiveCamera.position.z);
        const floorHeight = Math.max(groundHeight ?? 0, waterHeight ?? -Infinity);
        keepAboveFlatGround(orbitControls, perspectiveCamera, floorHeight, patchSettingsRef.current.chunkSize, Math.max(patchSettingsRef.current.maxHeight, 0));
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
      // The haze's floor is the sea's base height (applyTide's rule) and it thins over a share of the terrain's height.
      const { heightBase: hazeHeightBase, maxHeight: hazeMaxHeight } = patchSettingsRef.current;
      const hazeFloor = Math.max(0, water.tide.baseSeaLevel + hazeHeightBase) * Math.max(0, hazeMaxHeight);
      const hazeScaleHeight = HAZE_SCALE_SHARE * Math.max(hazeMaxHeight, 1e-4);
      for (const uniforms of [material.uniforms, water.mesh.material.uniforms]) {
        uniforms.uHazeFloor.value = hazeFloor;
        uniforms.uHazeScaleHeight.value = hazeScaleHeight;
      }
      (water.mesh.material.uniforms.uLightDirection.value as THREE.Vector3).copy(frameLight);
      updateSkyDomeFrame(sky, perspectiveCamera, frameLight, atmosphereRef.current.wind, deltaSeconds);
      updateChunkWaterFrame(water, perspectiveCamera.position, deltaSeconds, viewportElement!.clientWidth * window.devicePixelRatio);
      if (!patchRenderer.group.visible) return;
      const settings = patchSettingsRef.current;
      updateLife(settings);
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
          // The preview map's ground when it has arrived: the coarse grid misplaced patches by kilometers in height.
          ground: chunkLakes.ground
            ? { data: chunkLakes.ground.data, size: chunkLakes.ground.size, heightBase: settings.heightBase }
            : settings.groundHeights ? { data: settings.groundHeights.data, size: settings.groundHeights.width, heightBase: settings.heightBase } : undefined,
        },
        settings.bakePatch,
        sharedRendererRef.current.renderer?.capabilities.maxTextureSize ?? 2048,
        settings.advanceChunkBase,
      );
      walkMode.settleEye(); // after the ground pieces swap in, so the eye is never inside new ground
      // The shadows and water follow the finished map, so they switch with the patches when the full one is ready.
      const baseTexture = settings.chunkBaseTexture();
      if (baseTexture) {
        material.uniforms.uChunkHeightMap.value = baseTexture;
        water.mesh.material.uniforms.uChunkHeightMap.value = baseTexture;
      }
      const preview = settings.chunkPreview();
      const lakeRenderer = sharedRendererRef.current.renderer;
      if (preview && lakeRenderer) chunkLakes.update(lakeRenderer, preview, water.tide.baseSeaLevel, settings.atmosphere, squareSizeKm(settings.patch, settings.radiusKm), settings.radiusKm, settings.lakesOn, Math.max(settings.maxHeight, 0) * 1000);
      material.uniforms.uLakeCells.value = chunkLakes.texture.image.width;
    }
    sharedRenderer.registerView('landChunk', { scene, camera: perspectiveCamera, elementRef: viewportRef, onFrame, graded: true });

    return () => {
      viewportElement.removeEventListener('pointerdown', pivotOnGround, { capture: true });
      window.removeEventListener('keydown', handleSpaceKey);
      window.removeEventListener('keyup', handleSpaceKey);
      window.removeEventListener('blur', releaseSpace);
      viewportElement.removeEventListener('pointerenter', markPointerOver);
      viewportElement.removeEventListener('pointerleave', markPointerOut);
      viewportElement.removeEventListener('wheel', pivotOnGround, { capture: true });
      sharedRenderer.unregisterView('landChunk');
      clearTimeout(lifeTimer);
      lifeGrid.dispose();
      walkMap.dispose();
      walkMode.dispose();
      orbitControls.dispose();
      patchRenderer.dispose();
      material.dispose();
      water.dispose();
      chunkLakes.dispose();
      waterRef.current = null;
      sky.dispose();
      skyRef.current = null;
      moonPipelinesRef.current.forEach((pipeline) => pipeline?.dispose());
      moonPipelinesRef.current = [];
      moonBakedLayersRef.current = [];
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
    if (skyRef.current) setSkyDomeLight(skyRef.current, ambientLight, lightIntensity, diffuseWrap);
  }, [ambientLight, lightIntensity, specularStrength, shininess, diffuseWrap, lightDirX, lightDirY, lightDirZ]);

  // The sky fill's color, from the sky and Shadow hue.
  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    (material.uniforms.uFillColor.value as THREE.Color).copy(fillColorFor(atmosphere.enabled, atmosphere.zenithColor, shadowHue));
  }, [atmosphere.enabled, atmosphere.zenithColor, shadowHue]);

  // Life's looks (biome/plantTypes.ts): colors and pattern change without regrowing it.
  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    const land = landMiddleColor(colorStops);
    const look = (prefix: 'uAlgae' | 'uMoss', type: BiomeSettings['algae'], seed: number) => {
      const colors = lifeColors({ ...type.look, saturationShare: LIFE_SATURATION[prefix === 'uAlgae' ? 'algae' : 'moss'] }, land);
      const vector = (name: string) => material.uniforms[prefix + name].value as THREE.Vector4;
      vector('Hue').set(colors.hue, type.look.hueSpread, colors.saturation[0], colors.saturation[1]);
      vector('Shade').set(colors.lightness[0], colors.lightness[1], Math.max(type.look.patternMeters, 0.01), seed);
      vector('Mask').set((type.look.lightnessShare[0] + type.look.lightnessShare[1]) / 2, type.look.edgeAmount, type.look.edgeThickness, 0);
      vector('Velvet').set(type.look.velvetCore, type.look.velvetPower, type.look.velvetEdge, type.look.shine);
    };
    look('uAlgae', biome.algae, 1);
    look('uMoss', biome.moss, 2);
    for (const [prefix, type] of [['uAlgae', biome.algae], ['uMoss', biome.moss]] as const) {
      (material.uniforms[prefix + 'Temperature'].value as THREE.Vector4).set(...rangeVector(type.temperature));
      (material.uniforms[prefix + 'Moisture'].value as THREE.Vector4).set(...rangeVector(type.moisture));
      (material.uniforms[prefix + 'Sun'].value as THREE.Vector4).set(...rangeVector(type.sun));
    }
  }, [biome, colorStops]);

  // The Patches debug view: each patch's own color over the ground.
  useEffect(() => {
    const material = materialRef.current;
    if (material) material.uniforms.uPatchDebug.value = debugView === 'patches' ? 1 : 0;
  }, [debugView]);

  // Toon shading (atmosphere's shade settings).
  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uShadeStep.value = atmosphere.shadeEnabled ? atmosphere.shadeStep : 0; // 0 is off in the shader
    material.uniforms.uShadeFeather.value = atmosphere.shadeFeather;
    material.uniforms.uShadeLift.value = atmosphere.shadeLift;
    material.uniforms.uShadeChroma.value = atmosphere.shadeChroma;
    material.uniforms.uShadeHueTurn.value = shadowHue / 360;
  }, [atmosphere.shadeEnabled, atmosphere.shadeStep, atmosphere.shadeFeather, atmosphere.shadeLift, atmosphere.shadeChroma, shadowHue]);

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
    material.uniforms.uHeightBase.value = heightBase;
    // Where the edge is under the sea the water wall covers the side, so the land's side is dropped (chunk.frag.glsl).
    material.uniforms.uWaterOn.value = water.enabled ? 1 : 0;
    material.uniforms.uSeaLevel.value = water.seaLevel;
    material.uniforms.uColorByElevation.value = colorByElevation ? 1 : 0;
    const ramp = buildRampUniformArrays(colorStops);
    const rampColors = material.uniforms.uRampColors.value as THREE.Color[];
    for (let i = 0; i < MAX_COLOR_STOPS; i++) rampColors[i].copy(ramp.colors[i]);
    (material.uniforms.uRampPositions.value as number[]).splice(0, MAX_COLOR_STOPS, ...ramp.positions);
    material.uniforms.uRampCount.value = ramp.count;
    applyRockUniforms(material.uniforms, rock);
    // With water on, the land ramp starts at the depth light reaches, as on the planet.
    material.uniforms.uElevationMin.value = water.enabled
      ? Math.max(elevationMin, landRampFloor(water.seaLevel, waterDeepest))
      : elevationMin;
    material.uniforms.uElevationMax.value = elevationMax;
    material.uniforms.uShadowsEnabled.value = shadowsEnabled ? 1 : 0;
    material.uniforms.uHeightMapGreenChannel.value = heightMapGreenChannel ? 1 : 0;
  }, [
    heightMap,
    heightMapResolution,
    chunkSize,
    maxHeight,
    heightBase,
    colorByElevation,
    baseColor,
    colorStops,
    rock,
    elevationMin,
    elevationMax,
    shadowsEnabled,
    heightMapGreenChannel,
    water.enabled,
    water.seaLevel,
    water.seaLevel,
    waterDeepest,
  ]);

  // The water sheet (Seascape): placed at sea level over the chunk, reading the same height texture as the ground.
  useEffect(() => {
    const chunkWater = waterRef.current;
    if (!chunkWater) return;
    updateChunkWater(chunkWater, water, chunkSize, maxHeight, heightBase, waterDeepest, waterClarityShare, heightMap, heightMapGreenChannel, Math.min(atmosphere.wind, MAX_WAVE_WIND));
    chunkWater.mesh.visible = water.enabled && heightMap !== null;
  }, [water, waterDeepest, waterClarityShare, heightMap, heightMapGreenChannel, chunkSize, maxHeight, heightBase, atmosphere.wind]);

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
      material.uniforms.uHazeLayers.value = atmosphere.hazeLayers;
    }
    if (waterRef.current) setChunkWaterSky(waterRef.current, atmosphere.enabled ? atmosphere.horizonColor : WATER_SKY_COLOR, atmosphere.horizonColor, atmosphere.zenithColor, hazeDensity, atmosphere.hazeLayers);
  }, [atmosphere, chunkSize]);

  // Tides: the moon's size sets how far the water rises and falls (atmosphere/tides.ts). Walk mode reads the water's
  // live height, so a rising tide pushes the walker to the nearest dry ground.
  useEffect(() => {
    const sizes = atmosphere.moons.slice(0, atmosphere.moonCount).map((moon) => moon.size);
    const viscosity = viscosityAt(liquidNamed(atmosphere.liquid), atmosphere.temperature);
    if (waterRef.current) setChunkWaterTide(waterRef.current, tideHeight(atmosphere.enabled && atmosphere.moon, sizes, radiusKm, viscosity));
  }, [atmosphere.enabled, atmosphere.moon, atmosphere.moons, atmosphere.moonCount, atmosphere.liquid, atmosphere.temperature, radiusKm]);

  // Each shown moon's surface, one pipeline per moon (each bake has its own target): re-baked only when that moon's
  // layers change (Randomize), and only while the moons are shown.
  useEffect(() => {
    if (!atmosphere.moon) return;
    let frameId = 0;
    const bake = () => {
      const renderer = sharedRendererRef.current.renderer;
      const sky = skyRef.current;
      if (!renderer || !sky) {
        frameId = requestAnimationFrame(bake); // the shared renderer can arrive a frame after mount
        return;
      }
      atmosphere.moons.slice(0, atmosphere.moonCount).forEach((moon, i) => {
        if (moonBakedLayersRef.current[i] === moon.layers) return;
        const pipeline = (moonPipelinesRef.current[i] ??= new HeightmapPipeline(MOON_TEXTURE_WIDTH, MOON_TEXTURE_WIDTH / 2));
        setSkyDomeMoonTexture(sky, i, pipeline.render(renderer, { layers: moon.layers }));
        moonBakedLayersRef.current[i] = moon.layers;
      });
    };
    bake();
    return () => cancelAnimationFrame(frameId);
  }, [atmosphere.moon, atmosphere.moons, atmosphere.moonCount]);

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
    if (patchesEnabled) patchRendererRef.current?.markAllStale();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-bakes only when the terrain changes
  }, [bakeVersion]);

  return null;
});
