import { useEffect, useState, type RefObject } from 'react';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';
import type { StrokeRecord } from './heightmap';

// Owns the brush tool's own settings and the paint stroke history/undo —
// a painting concern, not a persistence one (project/saveProject.ts reads
// strokeHistory to save it, but doesn't own its editing logic). See
// ISSUES.md, 2026-09-22, for why this was split out of App.tsx.
export function useBrush(sceneHandleRef: RefObject<SceneCanvasHandle | null>) {
  const [brushRadiusPx, setBrushRadiusPx] = useState(20); // TODO(DS): arbitrary placeholder default
  const [brushValue, setBrushValue] = useState(1); // -1 (erase/black) .. 1 (paint/white)
  const [feather, setFeather] = useState(1); // 0=hard edge, 1=fully soft — a fraction of brushRadiusPx
  // Every completed stroke, across all layers, in the order painted — the
  // retraceable source of truth for painted terrain (not just a baked
  // raster), and what Cmd+Z undoes from. See ROADMAP.md, Stage 06.
  const [strokeHistory, setStrokeHistory] = useState<StrokeRecord[]>([]);
  // Bumped whenever the paint texture changes for a reason MapView's own
  // props wouldn't otherwise tell it about (currently: undo) — see undo()
  // below and MapView's own refresh effect.
  const [paintVersion, setPaintVersion] = useState(0);

  function handleStrokeComplete(record: StrokeRecord) {
    setStrokeHistory((previous) => [...previous, record]); // live paint already reflects it — no replay needed here
  }

  // Undoes the single most recent stroke, regardless of which layer it was
  // painted on (matching standard undo behavior) — pops it from the history
  // and rebuilds every layer's paint texture from what remains. Uses the
  // functional setState form so this can be called from a keydown listener
  // registered once (see the effect below) without going stale.
  function undo() {
    setStrokeHistory((previous) => {
      if (previous.length === 0) return previous;
      const next = previous.slice(0, -1);
      sceneHandleRef.current?.applyStrokeHistory(next);
      return next;
    });
    // Nothing else watches strokeHistory, so without this MapView's 2D
    // canvas would never know to re-read the texture after an undo.
    setPaintVersion((version) => version + 1);
  }

  // Cmd+Z (Mac) / Ctrl+Z (Windows/Linux) — Shift excluded so it doesn't also
  // fire on a future Cmd+Shift+Z redo shortcut.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isUndoShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey;
      if (!isUndoShortcut) return;
      event.preventDefault();
      undo();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- undo() reads strokeHistory via the functional setState form, never stale
  }, []);

  return {
    brushRadiusPx,
    setBrushRadiusPx,
    brushValue,
    setBrushValue,
    feather,
    setFeather,
    strokeHistory,
    setStrokeHistory,
    paintVersion,
    handleStrokeComplete,
    undo,
  };
}
