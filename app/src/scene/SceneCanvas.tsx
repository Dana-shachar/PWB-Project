import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as THREE from 'three';
import { scene } from './scene';
import { renderer } from './renderer';
import { camera } from './camera';
import { controls } from './controls';
import { grid } from './grid';
import { planet, planetGeometry } from './planet';
import { Gumball } from './Gumball';
import { HeightmapPipeline, type NoiseLayer, type UV } from '../map/heightmap';

// Exposed to sibling components (MapView, via App.tsx) that need to paint
// onto or read the shared heightmap pipeline this component owns — see
// ISSUES.md, 2026-09-15, for why the pipeline has to live with this
// component's renderer specifically, not a separate instance.
export interface SceneCanvasHandle {
  paintStroke(layerId: string, uv: UV, radius: number, brushValue?: number, feather?: number): void;
  getPreviewImageData(): ImageData | null;
}

// TODO(DS): arbitrary placeholder line color, not borrowed from anywhere.
// NOTE: built from the sphere's plain (undisplaced) geometry — displacement
// happens only in the GPU vertex shader, so this overlay won't track the
// actual bumpy noise-displaced surface. Fine for now (surface is flat),
// revisit once real terrain height makes this mismatch visible.
function buildWireframeOverlay(geometry: THREE.BufferGeometry): THREE.LineSegments {
  const wireframeGeometry = new THREE.WireframeGeometry(geometry);
  const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
  return new THREE.LineSegments(wireframeGeometry, material);
}

interface SceneCanvasProps {
  radius: number; // planet radius, in scene units (already converted from km by the caller)
  baseColor: string; // hex string, e.g. "#3a7bd5"
  ambientLight: number;
  lightDirX: number;
  lightDirY: number;
  displayMode: string; // 'shaded' | 'wireframe'
  gridSpacing: number; // minor grid cell size, in world units
  gridVisible: boolean;
  layers: NoiseLayer[];
}

// React places this <canvas> on the page; everything Three.js-related lives
// in local variables/refs inside effects (never React state), per the class's
// own React <-> Three.js convention: React owns layout, Three.js owns the stage.
export const SceneCanvas = forwardRef<SceneCanvasHandle, SceneCanvasProps>(function SceneCanvas(
  { radius, baseColor, ambientLight, lightDirX, lightDirY, displayMode, gridSpacing, gridVisible, layers },
  handleRef,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const planetMeshRef = useRef<THREE.Mesh | null>(null);
  const wireframeOverlayRef = useRef<THREE.LineSegments | null>(null);
  const gridMeshRef = useRef<THREE.Mesh | null>(null);
  const webglRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const heightmapPipelineRef = useRef<HeightmapPipeline | null>(null);
  const layersRef = useRef<NoiseLayer[]>(layers); // lets the imperative handle read the current layers without re-creating itself
  layersRef.current = layers;

  useImperativeHandle(
    handleRef,
    () => ({
      paintStroke(layerId, uv, radius, brushValue = 1, feather = 1) {
        const webglRenderer = webglRendererRef.current;
        const heightmapPipeline = heightmapPipelineRef.current;
        const planetMesh = planetMeshRef.current;
        if (!webglRenderer || !heightmapPipeline || !planetMesh) return;
        heightmapPipeline.paintStroke(webglRenderer, layerId, uv, radius, brushValue, feather);
        // Re-composite so the planet's displacement reflects the new stroke immediately.
        const heightmapTexture = heightmapPipeline.render(webglRenderer, { layers: layersRef.current });
        (planetMesh.material as THREE.ShaderMaterial).uniforms.uHeightMap.value = heightmapTexture;
      },
      getPreviewImageData() {
        const webglRenderer = webglRendererRef.current;
        const heightmapPipeline = heightmapPipelineRef.current;
        if (!webglRenderer || !heightmapPipeline) return null;
        return heightmapPipeline.getCompositeImageData(webglRenderer);
      },
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const webglRenderer = renderer(canvas);
    const perspectiveCamera = camera(canvas.clientWidth / canvas.clientHeight);
    const orbitControls = controls(perspectiveCamera, canvas);
    const gridMesh = grid(gridSpacing);
    const planetMesh = planet(radius);
    // Centered at the origin (matches the camera/orbit-controls target) so
    // changing the radius grows/shrinks the planet symmetrically in place,
    // rather than anchoring one edge and letting the center drift.
    const wireframeOverlay = buildWireframeOverlay(planetMesh.geometry);
    wireframeOverlay.visible = displayMode === 'wireframe';
    planetMesh.add(wireframeOverlay); // child of the mesh — inherits its position/scale
    planetMeshRef.current = planetMesh;
    wireframeOverlayRef.current = wireframeOverlay;
    gridMeshRef.current = gridMesh;
    webglRendererRef.current = webglRenderer;
    heightmapPipelineRef.current = new HeightmapPipeline();

    scene.add(gridMesh);
    scene.add(planetMesh);

    // Gumball has no reactive props of its own (driven entirely by camera/
    // controls, both local to this effect) — no ref needed, nothing else
    // ever reassigns it, so there's no leak risk the way grid/planet had.
    // canvas.parentElement is .app-viewport — confines the widget to the
    // 3D viewport instead of the whole window, see Gumball.tsx.
    const gumball = new Gumball(perspectiveCamera, orbitControls, canvas.parentElement!);

    function resize() {
      // Non-null assertions: TS can't prove `canvas` is still non-null inside
      // this closure since it's passed to ResizeObserver (an async callback),
      // but it structurally is — the observer is disconnected in cleanup
      // before the ref could ever go stale.
      const width = canvas!.clientWidth;
      const height = canvas!.clientHeight;
      webglRenderer.setSize(width, height, false);
      perspectiveCamera.aspect = width / height;
      perspectiveCamera.updateProjectionMatrix();
    }
    resize();

    // ResizeObserver (not a window 'resize' listener) so the scene responds to
    // the canvas's own size changing — e.g. the control panel — not just the window.
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    let animationFrameId: number;
    function animate() {
      orbitControls.update(); // required every frame — damping is enabled, see controls.ts
      webglRenderer.render(scene, perspectiveCamera);
      // gumball.update() must come AFTER render(): it reads camera.matrixWorld,
      // which only gets freshly recomputed for a parentless camera (ours isn't
      // added to the scene graph) during render(). Calling it before render()
      // (as I originally had it) meant it always read stale matrix data —
      // matches the original's exact ordering in active-geometry's main.js.
      gumball.update();
      animationFrameId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
      gumball.dispose();
      orbitControls.dispose();
      webglRenderer.dispose();

      heightmapPipelineRef.current?.dispose();
      heightmapPipelineRef.current = null;
      webglRendererRef.current = null;

      // Remove/dispose whatever the refs *currently* point to, not the
      // `gridMesh`/`planetMesh` this specific effect run created — the grid
      // spacing effect below can have since replaced gridMeshRef.current
      // with a newer object. Cleaning up the stale closure variable instead of
      // the ref's current value leaked the old object under React StrictMode's
      // mount->cleanup->mount dev cycle, which duplicated the grid on screen.
      const currentGrid = gridMeshRef.current;
      if (currentGrid) {
        scene.remove(currentGrid);
        currentGrid.geometry.dispose();
        (currentGrid.material as THREE.Material).dispose();
      }
      gridMeshRef.current = null;

      const currentOverlay = wireframeOverlayRef.current;
      if (currentOverlay) {
        currentOverlay.geometry.dispose();
        (currentOverlay.material as THREE.Material).dispose();
      }
      wireframeOverlayRef.current = null;

      const currentPlanet = planetMeshRef.current;
      if (currentPlanet) {
        scene.remove(currentPlanet); // also removes the overlay, added as its child
        currentPlanet.geometry.dispose();
        (currentPlanet.material as THREE.Material).dispose();
      }
      planetMeshRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- every prop here
    // has its own reactive effect below (rebuilding just the affected piece is
    // cheaper than tearing down the whole scene/renderer/controls on every
    // slider drag); this effect only handles first-mount setup and teardown.
  }, []);

  // Radius: rebuilds the sphere geometry and repositions it — and the
  // wireframe overlay with it, since WireframeGeometry is a one-time
  // snapshot, not dynamically linked to the source geometry.
  useEffect(() => {
    const planetMesh = planetMeshRef.current;
    const wireframeOverlay = wireframeOverlayRef.current;
    if (!planetMesh || !wireframeOverlay) return; // not mounted yet — the effect above uses the current radius on first build
    planetMesh.geometry.dispose();
    planetMesh.geometry = planetGeometry(radius);

    // Keep these in sync with the new radius too, not just the geometry.
    const material = planetMesh.material as THREE.ShaderMaterial;
    material.uniforms.uDisplacementAmplitude.value = radius * 0.15;
    material.uniforms.uRadius.value = radius;

    wireframeOverlay.geometry.dispose();
    wireframeOverlay.geometry = new THREE.WireframeGeometry(planetMesh.geometry);
  }, [radius]);

  // Grid spacing: rebuilds the grid mesh (its cell size is baked into a
  // shader uniform at construction, simplest to just rebuild it).
  useEffect(() => {
    const oldGrid = gridMeshRef.current;
    if (!oldGrid) return;
    scene.remove(oldGrid);
    oldGrid.geometry.dispose();
    (oldGrid.material as THREE.Material).dispose();

    const newGrid = grid(gridSpacing);
    newGrid.visible = gridVisible;
    scene.add(newGrid);
    gridMeshRef.current = newGrid;
  }, [gridSpacing, gridVisible]);

  // Lighting + base color: no rebuild needed, just mutate the shader's uniforms.
  useEffect(() => {
    const planetMesh = planetMeshRef.current;
    if (!planetMesh) return;
    const material = planetMesh.material as THREE.ShaderMaterial;
    material.uniforms.uBaseColor.value.set(baseColor);
    material.uniforms.uAmbient.value = ambientLight;
    material.uniforms.uLightDirection.value.set(lightDirX, lightDirY, 1);
  }, [baseColor, ambientLight, lightDirX, lightDirY]);

  // Display mode: toggles the wireframe overlay's visibility (it renders
  // alongside the shaded surface, doesn't replace it).
  useEffect(() => {
    const wireframeOverlay = wireframeOverlayRef.current;
    if (!wireframeOverlay) return;
    wireframeOverlay.visible = displayMode === 'wireframe';
  }, [displayMode]);

  // Layers: regenerates the heightmap texture on demand (not every frame —
  // only when the layer stack actually changes), then points the planet's
  // uHeightMap at it. The planet's vertex shader samples this same texture
  // reference every frame regardless, so the sphere updates live with no
  // extra wiring needed here beyond assigning the uniform once.
  useEffect(() => {
    const planetMesh = planetMeshRef.current;
    const webglRenderer = webglRendererRef.current;
    const heightmapPipeline = heightmapPipelineRef.current;
    if (!planetMesh || !webglRenderer || !heightmapPipeline) return;

    const heightmapTexture = heightmapPipeline.render(webglRenderer, { layers });
    const material = planetMesh.material as THREE.ShaderMaterial;
    material.uniforms.uHeightMap.value = heightmapTexture;
  }, [layers]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
});
