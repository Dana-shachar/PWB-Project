import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as THREE from 'three';
import chunkVertexGlsl from '../shaders/chunk.vert.glsl?raw';
import chunkFragmentGlsl from '../shaders/chunk.frag.glsl?raw';
import { renderer } from '../scene/renderer';
import { camera, defaultCameraPosition } from '../scene/camera';
import { controls } from '../scene/controls';
import { grid } from '../scene/grid';
import type { GumballTarget } from '../scene/Gumball';

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
  // component's own state. Direction is used as-is; intensity is rescaled
  // for this material — see the lighting effect below for why.
  ambientLight: number;
  lightDirX: number;
  lightDirY: number;
  gridSpacing: number;
  gridVisible: boolean;
  // Shared with the planet's own "Base color" control (Dana, 2026-09-23 —
  // "there are color controls," this shouldn't have its own disconnected one).
  baseColor: string;
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
  { geometry, ambientLight, lightDirX, lightDirY, gridSpacing, gridVisible, baseColor },
  handleRef,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const webglRenderer = renderer(canvas);
    const perspectiveCamera = camera(canvas.clientWidth / canvas.clientHeight);
    perspectiveCamera.position.copy(defaultCameraPosition(CHUNK_CAMERA_DISTANCE));
    perspectiveCamera.lookAt(0, 0, 0);
    const orbitControls = controls(perspectiveCamera, canvas);
    gumballTargetRef.current = { camera: perspectiveCamera, cameraControls: orbitControls, referenceDistance: CHUNK_CAMERA_DISTANCE };

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const gridMesh = grid(gridSpacing);
    gridMesh.visible = gridVisible;
    scene.add(gridMesh);
    gridMeshRef.current = gridMesh;

    function resize() {
      const width = canvas!.clientWidth;
      const height = canvas!.clientHeight;
      webglRenderer.setSize(width, height, false);
      perspectiveCamera.aspect = width / height;
      perspectiveCamera.updateProjectionMatrix();
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    let animationFrameId: number;
    function animate() {
      orbitControls.update();
      webglRenderer.render(scene, perspectiveCamera);
      animationFrameId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
      orbitControls.dispose();
      webglRenderer.dispose();
      sceneRef.current = null;
      gridMeshRef.current = null;
      materialRef.current = null;
      gumballTargetRef.current = null;
    };
  }, []);

  // Lighting — the Scene controls now mean exactly what they mean on the
  // planet, because both go through the same model (shaders/chunk.frag.glsl
  // and shaders/fragment.glsl). The old rescaling multipliers are gone with
  // the standard material that needed them.
  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uAmbient.value = ambientLight;
    material.uniforms.uLightDirection.value.set(lightDirX, lightDirY, 1);
  }, [ambientLight, lightDirX, lightDirY]);

  // Base color — shared with the planet's own ColorPicker, not a separate
  // hardcoded placeholder.
  useEffect(() => {
    materialRef.current?.uniforms.uBaseColor.value.set(baseColor);
  }, [baseColor]);

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

  // Swaps in the generated chunk mesh whenever a new geometry arrives.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !geometry) return;
    const previousMesh = meshRef.current;
    if (previousMesh) {
      scene.remove(previousMesh);
      (previousMesh.material as THREE.Material).dispose();
    }
    // DoubleSide as a safety net against any wall-winding mistakes — Three.js
    // flips the lighting normal for back-facing polygons automatically, so
    // this stays visually correct either way, not just a visibility patch.
    const material = new THREE.ShaderMaterial({
      vertexShader: chunkVertexGlsl,
      fragmentShader: chunkFragmentGlsl,
      side: THREE.DoubleSide,
      uniforms: {
        uBaseColor: { value: new THREE.Color(baseColor) },
        uLightDirection: { value: new THREE.Vector3(lightDirX, lightDirY, 1) },
        uAmbient: { value: ambientLight },
      },
    });
    materialRef.current = material;
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseColor's own effect above keeps an existing material in sync; only geometry should recreate the mesh
  }, [geometry]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
});
