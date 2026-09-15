import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { HeightmapPipeline } from './heightmap';

interface MapViewProps {
  seed: number;
  frequency: number;
}

// The flat 2D preview of the heightmap. Deliberately simple for this first
// pass: its own renderer + its own HeightmapPipeline instance, recomputing
// the noise a second time rather than sharing the texture SceneCanvas
// already computed — keeps the two components fully decoupled. Noise
// generation is cheap (see Dana's performance question, 2026-09-14), so
// this duplication is an acceptable simplification for now, not a final
// design — worth revisiting if it ever actually matters.
export function MapView({ seed, frequency }: MapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webglRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const heightmapPipelineRef = useRef<HeightmapPipeline | null>(null);
  const displayMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const displaySceneRef = useRef<THREE.Scene | null>(null);
  const displayCameraRef = useRef<THREE.OrthographicCamera | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const webglRenderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    const heightmapPipeline = new HeightmapPipeline();
    const displayMaterial = new THREE.MeshBasicMaterial();
    const displayScene = new THREE.Scene();
    const displayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    displayScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), displayMaterial));

    webglRendererRef.current = webglRenderer;
    heightmapPipelineRef.current = heightmapPipeline;
    displayMaterialRef.current = displayMaterial;
    displaySceneRef.current = displayScene;
    displayCameraRef.current = displayCamera;

    function resize() {
      const width = canvas!.clientWidth;
      const height = canvas!.clientHeight;
      webglRenderer.setSize(width, height, false);
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.disconnect();
      heightmapPipeline.dispose();
      displayMaterial.dispose();
      webglRenderer.dispose();
      webglRendererRef.current = null;
      heightmapPipelineRef.current = null;
      displayMaterialRef.current = null;
      displaySceneRef.current = null;
      displayCameraRef.current = null;
    };
  }, []);

  // Regenerate the heightmap and redraw the preview whenever seed/frequency
  // change — no continuous animation loop needed, this is a static preview
  // image until parameters change again.
  useEffect(() => {
    const webglRenderer = webglRendererRef.current;
    const heightmapPipeline = heightmapPipelineRef.current;
    const displayMaterial = displayMaterialRef.current;
    const displayScene = displaySceneRef.current;
    const displayCamera = displayCameraRef.current;
    if (!webglRenderer || !heightmapPipeline || !displayMaterial || !displayScene || !displayCamera) return;

    const heightmapTexture = heightmapPipeline.render(webglRenderer, { seed, frequency });
    displayMaterial.map = heightmapTexture;
    displayMaterial.needsUpdate = true;
    webglRenderer.render(displayScene, displayCamera);
  }, [seed, frequency]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '200px', display: 'block' }} />;
}
