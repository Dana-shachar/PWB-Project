import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { renderer as createRenderer } from './renderer';
import { ColorGrade, DEFAULT_COLOR_GRADE, type ColorGradeSettings } from './colorGrade';

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
  // Drawn through the color grade (scene/colorGrade.ts); the chunk is, the planet isn't (Dana, 2026-11-10).
  graded?: boolean;
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
  // The planet's color grade, applied to the whole frame (scene/colorGrade.ts).
  setColorGrade(settings: ColorGradeSettings): void;
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
  const gradeRef = useRef<ColorGrade | null>(null);
  const gradeSettingsRef = useRef<ColorGradeSettings>(DEFAULT_COLOR_GRADE);
  function setColorGrade(settings: ColorGradeSettings) {
    gradeSettingsRef.current = settings;
    gradeRef.current?.update(settings);
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
    // Every view draws into the grade's multisampled image, then one pass grades it onto the canvas.
    const grade = new ColorGrade(webglRenderer);
    grade.update(gradeSettingsRef.current);
    gradeRef.current = grade;
    setRenderer(webglRenderer);

    function resize() {
      const width = container!.clientWidth;
      const height = container!.clientHeight;
      webglRenderer.setSize(width, height, false);
      grade.setSize(width, height);
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let animationFrameId: number;
    function animate() {
      const containerRect = container!.getBoundingClientRect();
      const containerHeight = containerRect.height;

      // Graded views (the chunk) draw into the grade's image, then the grade pass; the rest (the planet) draw straight
      // onto the canvas after it, as engines set post processing per camera. No graded view on screen, no grade pass.
      type Placed = { view: SharedViewportView; left: number; bottom: number; width: number; height: number };
      const placed: Placed[] = [];
      viewsRef.current.forEach((view) => {
        const element = view.elementRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        // A hidden pane (display:none) reports a zero-size rect, which alone skips rendering it.
        if (rect.width === 0 || rect.height === 0) return;
        // WebGL's origin is bottom-left, the DOM's top-left, both relative to the shared canvas.
        const left = rect.left - containerRect.left;
        const top = rect.top - containerRect.top;
        placed.push({ view, left, bottom: containerHeight - (top + rect.height), width: rect.width, height: rect.height });
      });
      const prepare = ({ view, width, height }: Placed) => {
        const aspect = width / height;
        if (view.camera.aspect !== aspect) {
          view.camera.aspect = aspect;
          view.camera.updateProjectionMatrix();
        }
        view.onFrame?.();
      };

      const graded = placed.filter((entry) => entry.view.graded);
      if (graded.length > 0) {
        grade.begin();
        for (const entry of graded) {
          prepare(entry);
          grade.drawView(entry.view.scene, entry.view.camera, entry.left, entry.bottom, entry.width, entry.height);
        }
        grade.finish(container!.clientWidth, containerHeight);
      } else {
        webglRenderer.setRenderTarget(null);
        webglRenderer.setScissorTest(false);
        webglRenderer.clear();
      }
      for (const entry of placed) {
        if (entry.view.graded) continue;
        prepare(entry);
        webglRenderer.setRenderTarget(null);
        webglRenderer.setViewport(entry.left, entry.bottom, entry.width, entry.height);
        webglRenderer.setScissor(entry.left, entry.bottom, entry.width, entry.height);
        webglRenderer.setScissorTest(true);
        webglRenderer.clear(); // only its rectangle: the scissor holds
        webglRenderer.render(entry.view.scene, entry.view.camera);
      }

      animationFrameId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
      grade.dispose();
      gradeRef.current = null;
      webglRenderer.dispose();
      canvas.remove();
      rendererRef.current = null;
      setRenderer(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- containerRef is a stable ref; views register/unregister themselves into viewsRef without needing this effect to re-run
  }, [containerRef]);

  return { renderer, registerView, unregisterView, setColorGrade };
}
