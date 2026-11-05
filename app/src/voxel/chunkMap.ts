import * as THREE from 'three';

// The walk map (Dana, 2026-11-04): the chunk seen from straight above with the scene's own materials, so the land, lakes
// and sea look as they do in the view, drawn into a small image only when asked, never every frame.
const MAP_PIXELS = 256; // Inferred, TUNABLE

export interface ChunkMap {
  canvas: HTMLCanvasElement; // the latest image, north (-z) up
  // overrideView sets the view-dependent uniforms (eye, haze) for the overhead camera and returns a function that restores them.
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, chunkSize: number, terrainTop: number, overrideView: (eye: THREE.Vector3) => () => void): void;
  dispose(): void;
}

export function createChunkMap(): ChunkMap {
  const target = new THREE.WebGLRenderTarget(MAP_PIXELS, MAP_PIXELS);
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
  camera.up.set(0, 0, -1);
  const canvas = document.createElement('canvas');
  canvas.width = MAP_PIXELS;
  canvas.height = MAP_PIXELS;
  const context = canvas.getContext('2d')!;
  const pixels = new Uint8Array(MAP_PIXELS * MAP_PIXELS * 4);
  let reading = false;

  return {
    canvas,
    render(renderer, scene, chunkSize, terrainTop, overrideView) {
      if (reading) return; // the last image is still on its way back from the GPU
      const half = chunkSize / 2;
      const height = Math.max(terrainTop, 1) * 3;
      camera.left = -half;
      camera.right = half;
      camera.top = half;
      camera.bottom = -half;
      camera.near = height * 0.01;
      camera.far = height * 2 + chunkSize;
      camera.position.set(0, height, 0);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      const restore = overrideView(camera.position);
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(previous);
      restore();
      reading = true;
      // Read back without stalling the frame (this repo's rule for GPU reads), then flip the rows into the canvas.
      void renderer.readRenderTargetPixelsAsync(target, 0, 0, MAP_PIXELS, MAP_PIXELS, pixels).then(() => {
        const image = context.createImageData(MAP_PIXELS, MAP_PIXELS);
        const rowBytes = MAP_PIXELS * 4;
        for (let row = 0; row < MAP_PIXELS; row++) image.data.set(pixels.subarray(row * rowBytes, (row + 1) * rowBytes), (MAP_PIXELS - 1 - row) * rowBytes);
        context.putImageData(image, 0, 0);
        reading = false;
      });
    },
    dispose() {
      target.dispose();
    },
  };
}
