import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { scene } from './scene';
import { renderer } from './renderer';
import { camera } from './camera';
import { controls } from './controls';
import { grid } from './grid';
import { planet, planetGeometry } from './planet';
import { Gumball } from './Gumball';

interface SceneCanvasProps {
  radius: number; // planet radius, in scene units (already converted from km by the caller)
  baseColor: string; // hex string, e.g. "#3a7bd5"
  ambientLight: number;
  lightDirX: number;
  lightDirY: number;
  gridDivisions: number;
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
  gridDivisions,
}: SceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const planetMeshRef = useRef<THREE.Mesh | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const webglRenderer = renderer(canvas);
    const perspectiveCamera = camera(canvas.clientWidth / canvas.clientHeight);
    const orbitControls = controls(perspectiveCamera, canvas);
    const gridHelper = grid(500, gridDivisions);
    const planetMesh = planet(radius);
    planetMesh.position.y = radius; // sit on top of the grid (y=0), not centered through it
    planetMeshRef.current = planetMesh;
    gridHelperRef.current = gridHelper;

    scene.add(gridHelper);
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

      // Remove/dispose whatever the refs *currently* point to, not the
      // `gridHelper`/`planetMesh` this specific effect run created — the grid
      // resolution effect below can have since replaced gridHelperRef.current
      // with a newer object. Cleaning up the stale closure variable instead of
      // the ref's current value leaked the old object under React StrictMode's
      // mount->cleanup->mount dev cycle, which duplicated the grid on screen.
      const currentGrid = gridHelperRef.current;
      if (currentGrid) {
        scene.remove(currentGrid);
        currentGrid.geometry.dispose();
        (currentGrid.material as THREE.Material).dispose();
      }
      gridHelperRef.current = null;

      const currentPlanet = planetMeshRef.current;
      if (currentPlanet) {
        scene.remove(currentPlanet);
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

  // Radius: rebuilds just the sphere geometry and repositions it.
  useEffect(() => {
    const planetMesh = planetMeshRef.current;
    if (!planetMesh) return; // not mounted yet — the effect above uses the current radius on first build
    planetMesh.geometry.dispose();
    planetMesh.geometry = planetGeometry(radius);
    planetMesh.position.y = radius;
  }, [radius]);

  // Grid resolution: rebuilds the grid helper (GridHelper has no way to change
  // its divisions in place, unlike the sphere which is a plain uniform swap).
  useEffect(() => {
    const oldGrid = gridHelperRef.current;
    if (!oldGrid) return;
    scene.remove(oldGrid);
    oldGrid.geometry.dispose();
    (oldGrid.material as THREE.Material).dispose();

    const newGrid = grid(500, gridDivisions);
    scene.add(newGrid);
    gridHelperRef.current = newGrid;
  }, [gridDivisions]);

  // Lighting + base color: no rebuild needed, just mutate the shader's uniforms.
  useEffect(() => {
    const planetMesh = planetMeshRef.current;
    if (!planetMesh) return;
    const material = planetMesh.material as THREE.ShaderMaterial;
    material.uniforms.uBaseColor.value.set(baseColor);
    material.uniforms.uAmbient.value = ambientLight;
    material.uniforms.uLightDirection.value.set(lightDirX, lightDirY, 1);
  }, [baseColor, ambientLight, lightDirX, lightDirY]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
