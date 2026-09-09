import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { scene } from './scene';
import { renderer } from './renderer';
import { camera } from './camera';
import { controls } from './controls';
import { grid } from './grid';
import { planet } from './planet';

// React places this <canvas> on the page; everything Three.js-related lives
// in local variables inside the effect (never React state), per the class's
// own React <-> Three.js convention: React owns layout, Three.js owns the stage.
export function SceneCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const webglRenderer = renderer(canvas);
    const perspectiveCamera = camera(canvas.clientWidth / canvas.clientHeight);
    const orbitControls = controls(perspectiveCamera, canvas);
    const gridHelper = grid();
    const planetMesh = planet();

    scene.add(gridHelper);
    scene.add(planetMesh);

    function resize() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      webglRenderer.setSize(width, height, false);
      perspectiveCamera.aspect = width / height;
      perspectiveCamera.updateProjectionMatrix();
    }
    resize();

    // ResizeObserver (not a window 'resize' listener) so the scene responds to
    // the canvas's own size changing — e.g. a future sidebar — not just the window.
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    let animationFrameId: number;
    function animate() {
      orbitControls.update(); // required every frame — damping is enabled, see controls.ts
      webglRenderer.render(scene, perspectiveCamera);
      animationFrameId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
      orbitControls.dispose();
      webglRenderer.dispose();

      scene.remove(gridHelper);
      gridHelper.geometry.dispose();
      (gridHelper.material as THREE.Material).dispose();

      scene.remove(planetMesh);
      planetMesh.geometry.dispose();
      (planetMesh.material as THREE.Material).dispose();
    };
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
