import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { renderer as createRenderer } from './renderer';

// One real WebGL resource (a texture, a render target) belongs to whichever
// THREE.WebGLRenderer/context created it and cannot be bound in a different
// one — the planet and the land chunk used to each own a separate renderer
// on a separate <canvas>, which is exactly what made a patch's baked GPU
// texture unusable by the chunk's own material (confirmed the hard way,
// Dana, 2026-10-17: "the chunk isnt showing the planet"). This is the real
// fix, not the CPU-readback workaround: one shared renderer, one shared
// canvas, each pane drawn into its own rectangle of it per frame via
// setViewport/setScissor, the documented Three.js technique for multiple
// simultaneous views (examples/webgl_multiple_elements.html). See
// REFERENCES.md and ISSUES.md, [B32].
export interface SharedViewportView {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  // The pane's own DOM element — its rect each frame is this view's
  // viewport/scissor rectangle. Also what OrbitControls listens on for this
  // pane (see each consumer's own camera-controls setup), not the shared
  // canvas itself, which has no pointer handling of its own.
  elementRef: RefObject<HTMLElement | null>;
  // Per-frame work specific to this view (orbitControls.update(), a
  // specular/eye-position uniform, the planet's own patch LOD update) — runs
  // right before this view renders, every frame it's actually drawn.
  onFrame?: () => void;
}

export interface SharedViewportRenderer {
  // State, not just a ref: React runs a child's mount effects before its
  // parent's, so SceneCanvas/LandChunkCanvas's own first effects would see a
  // ref's `.current` still null, with nothing to make them re-run once it
  // isn't. Exposing it as state means consumers put it in their own effect's
  // dependency array and correctly wait, then fire once it's real, instead
  // of silently skipping their first bake.
  renderer: THREE.WebGLRenderer | null;
  registerView(key: string, view: SharedViewportView): void;
  unregisterView(key: string): void;
}

// `containerRef` is the already-existing element both panes sit inside —
// App.tsx passes scene/sharedGumball.ts's own mountRef (.app-viewport),
// reusing that ref rather than attaching a second one to the same node.
export function useSharedViewportRenderer(containerRef: RefObject<HTMLElement | null>): SharedViewportRenderer {
  // The ref is what the animate loop itself reads every frame (a rAF loop
  // isn't a React re-render, it wants the current value synchronously, not
  // whatever was last captured in a render's closure) — kept alongside the
  // state version above, each serving a different reader.
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null);
  const viewsRef = useRef<Map<string, SharedViewportView>>(new Map());

  function registerView(key: string, view: SharedViewportView) {
    viewsRef.current.set(key, view);
  }
  function unregisterView(key: string) {
    viewsRef.current.delete(key);
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement('canvas');
    // z-index alone never put this behind the panes' own divs — those divs
    // have no `position` set (design.css), so they're static, and a
    // positioned element (this canvas, position:absolute) always paints
    // above static content regardless of z-index or DOM order, a fixed CSS
    // rule, not something z-index can override. That silently gave this
    // canvas every mouse event before OrbitControls' own listeners (bound to
    // the divs, see SceneCanvas.tsx/LandChunkCanvas.tsx) ever saw them,
    // dragging did nothing (Dana, 2026-10-17/18). This canvas only ever
    // needs to paint, the divs are the real interactive surface (layout,
    // click-to-select-pane, each view's viewport rect, OrbitControls
    // target), so it should never intercept pointer events at all.
    canvas.style.pointerEvents = 'none';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.zIndex = '0';
    container.prepend(canvas);

    const webglRenderer = createRenderer(canvas);
    webglRenderer.autoClear = false; // this loop clears explicitly once per frame, not once per view
    rendererRef.current = webglRenderer;
    setRenderer(webglRenderer);

    function resize() {
      const width = container!.clientWidth;
      const height = container!.clientHeight;
      webglRenderer.setSize(width, height, false);
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let animationFrameId: number;
    function animate() {
      const containerRect = container!.getBoundingClientRect();
      const containerHeight = containerRect.height;

      webglRenderer.setScissorTest(false);
      webglRenderer.clear();
      webglRenderer.setScissorTest(true);

      viewsRef.current.forEach((view) => {
        const element = view.elementRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        // A hidden pane (display:none via .viewport-pane--hidden) reports a
        // zero-size rect in every browser — this alone is what skips
        // rendering it, no separate visible flag to keep in sync with the
        // CSS class.
        if (rect.width === 0 || rect.height === 0) return;

        // Both rects share one coordinate space (getBoundingClientRect() is
        // always relative to the browser viewport), so subtracting the
        // container's own origin gives this pane's position relative to the
        // shared canvas, which is sized and positioned to exactly cover the
        // container. WebGL's viewport/scissor origin is bottom-left, DOM's
        // is top-left — left stays as-is, top needs flipping.
        const left = rect.left - containerRect.left;
        const top = rect.top - containerRect.top;
        const bottom = containerHeight - (top + rect.height);

        webglRenderer.setViewport(left, bottom, rect.width, rect.height);
        webglRenderer.setScissor(left, bottom, rect.width, rect.height);

        const aspect = rect.width / rect.height;
        if (view.camera.aspect !== aspect) {
          view.camera.aspect = aspect;
          view.camera.updateProjectionMatrix();
        }

        view.onFrame?.();
        webglRenderer.render(view.scene, view.camera);
      });

      animationFrameId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
      webglRenderer.dispose();
      canvas.remove();
      rendererRef.current = null;
      setRenderer(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- containerRef is a stable ref; views register/unregister themselves into viewsRef without needing this effect to re-run
  }, [containerRef]);

  return { renderer, registerView, unregisterView };
}
