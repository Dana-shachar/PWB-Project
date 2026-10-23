import { useEffect, useImperativeHandle, useRef, forwardRef, type RefObject } from 'react';
import * as THREE from 'three';
import chunkVertexGlsl from '../shaders/chunk.vert.glsl?raw';
import chunkFragmentBody from '../shaders/chunk.frag.glsl?raw';
import terrainGlsl from '../shaders/terrain.glsl?raw'; // elevation color ramp + shadow march — shared with fragment.glsl, see shaders/terrain.glsl
import { camera, defaultCameraPosition } from '../scene/camera';
import { controls } from '../scene/controls';
import { grid } from '../scene/grid';
import type { GumballTarget } from '../scene/Gumball';
import type { SharedViewportRenderer } from '../scene/sharedViewportRenderer';
import { buildRampUniformArrays, MAX_COLOR_STOPS, type ColorStop } from '../planet/colorRamp';

const chunkFragmentGlsl = terrainGlsl + chunkFragmentBody;

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
  // voxel/landChunk.ts and shaders/terrain.glsl.
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
  },
  handleRef,
) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const gridMeshRef = useRef<THREE.Mesh | null>(null);
  const gumballTargetRef = useRef<GumballTarget | null>(null);

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
    const viewportElement = viewportRef.current;
    if (!viewportElement) return;

    const perspectiveCamera = camera((viewportElement.clientWidth || 1) / (viewportElement.clientHeight || 1));
    perspectiveCamera.position.copy(defaultCameraPosition(CHUNK_CAMERA_DISTANCE));
    perspectiveCamera.lookAt(0, 0, 0);
    // Listens on this pane's own element, not a canvas — see SceneCanvas.tsx's
    // identical setup for why, scene/sharedViewportRenderer.ts owns the one
    // shared <canvas> now.
    const orbitControls = controls(perspectiveCamera, viewportElement);
    gumballTargetRef.current = { camera: perspectiveCamera, cameraControls: orbitControls, referenceDistance: CHUNK_CAMERA_DISTANCE };

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const gridMesh = grid(gridSpacing);
    gridMesh.visible = gridVisible;
    scene.add(gridMesh);
    gridMeshRef.current = gridMesh;

    function onFrame() {
      orbitControls.update();
      // Same reason as SceneCanvas's own onFrame: the specular term needs
      // the eye position, and the camera moves every frame under orbit
      // controls.
      const material = materialRef.current;
      if (material) material.uniforms.uCameraPosition.value.copy(perspectiveCamera.position);
    }
    sharedRenderer.registerView('landChunk', { scene, camera: perspectiveCamera, elementRef: viewportRef, onFrame });

    return () => {
      sharedRenderer.unregisterView('landChunk');
      orbitControls.dispose();
      sceneRef.current = null;
      gridMeshRef.current = null;
      materialRef.current = null;
      gumballTargetRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewportRef is a stable ref object; sharedRenderer.registerView/unregisterView get new identities every parent render but only need calling once at mount/unmount
  }, []);

  // Lighting — the Scene controls now mean exactly what they mean on the
  // planet, because both go through the same model (shaders/chunk.frag.glsl
  // and shaders/fragment.glsl). The old rescaling multipliers are gone with
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
    material.uniforms.uChunkSize.value = chunkSize;
    material.uniforms.uMaxHeight.value = maxHeight;
    material.uniforms.uColorByElevation.value = colorByElevation ? 1 : 0;
    const ramp = buildRampUniformArrays(colorStops);
    const rampColors = material.uniforms.uRampColors.value as THREE.Color[];
    for (let i = 0; i < MAX_COLOR_STOPS; i++) rampColors[i].copy(ramp.colors[i]);
    (material.uniforms.uRampPositions.value as number[]).splice(0, MAX_COLOR_STOPS, ...ramp.positions);
    material.uniforms.uRampCount.value = ramp.count;
    material.uniforms.uElevationMin.value = elevationMin;
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
  ]);

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
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !geometry) return;
    if (materialRef.current && meshRef.current) {
      meshRef.current.geometry.dispose();
      meshRef.current.geometry = geometry;
      return;
    }
    // DoubleSide as a safety net against any wall-winding mistakes — Three.js
    // flips the lighting normal for back-facing polygons automatically, so
    // this stays visually correct either way, not just a visibility patch.
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
        // Current values at creation time — the effect below keeps these in
        // sync afterward without needing a whole new material.
        uHeightMap: { value: heightMap },
        uHeightMapTexelSize: { value: 1 / Math.max(1, heightMapResolution) },
        uChunkSize: { value: chunkSize },
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
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseColor's own effect above keeps an existing material in sync; only geometry should recreate the mesh
  }, [geometry]);

  return null;
});
