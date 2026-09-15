import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { scene } from './scene';
import { renderer } from './renderer';
import { camera } from './camera';
import { controls } from './controls';
import { grid } from './grid';
import { planet, planetGeometry } from './planet';
import { Gumball } from './Gumball';
import { HeightmapPipeline } from '../map/heightmap';

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
  noiseSeed: number;
  noiseFrequency: number;
}

// React places this <canvas> on the page; everything Three.js-related lives
// in local variables/refs inside effects (never React state), per the class's
// own React <-> Three.js convention: React owns layout, Three.js owns the stage.
export function SceneCanvas({
  radius,
  baseColor,
  ambientLight,
  lightDirX,
  lightDirY,
  displayMode,
  gridSpacing,
  gridVisible,
  noiseSeed,
  noiseFrequency,
}: SceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const planetMeshRef = useRef<THREE.Mesh | null>(null);
  const wireframeOverlayRef = useRef<THREE.LineSegments | null>(null);
  const gridMeshRef = useRef<THREE.Mesh | null>(null);
  const webglRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const heightmapPipelineRef = useRef<HeightmapPipeline | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const webglRenderer = renderer(canvas);
    const perspectiveCamera = camera(canvas.clientWidth / canvas.clientHeight);
    const orbitControls = controls(perspectiveCamera, canvas);
    const gridMesh = grid(gridSpacing);
    const planetMesh = planet(radius);
    planetMesh.position.y = radius; // sit on top of the grid (y=0), not centered through it
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
    const gumball = new Gumball(perspectiveCamera, orbitControls);

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
    planetMesh.position.y = radius;

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

  // Noise seed/frequency: regenerates the heightmap texture on demand (not
  // every frame — only when a param actually changes), then points the
  // planet's uHeightMap at it. The planet's vertex shader samples this same
  // texture reference every frame regardless, so the sphere updates live
  // with no extra wiring needed here beyond assigning the uniform once.
  useEffect(() => {
    const planetMesh = planetMeshRef.current;
    const webglRenderer = webglRendererRef.current;
    const heightmapPipeline = heightmapPipelineRef.current;
    if (!planetMesh || !webglRenderer || !heightmapPipeline) return;

    const heightmapTexture = heightmapPipeline.render(webglRenderer, {
      seed: noiseSeed,
      frequency: noiseFrequency,
    });
    const material = planetMesh.material as THREE.ShaderMaterial;
    material.uniforms.uHeightMap.value = heightmapTexture;
  }, [noiseSeed, noiseFrequency]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
