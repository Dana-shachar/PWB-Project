import { useEffect, useRef, useState, type RefObject } from 'react';
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
  // Strokes popped by undo, most-recent last — redo replays them back onto
  // strokeHistory. Cleared by a new stroke, matching standard undo/redo
  // behavior (you can't redo past a fresh edit).
  const [redoStack, setRedoStack] = useState<StrokeRecord[]>([]);
  // Bumped whenever the paint texture changes for a reason MapView's own
  // props wouldn't otherwise tell it about (currently: undo/redo) — see
  // undo()/redo() below and MapView's own refresh effect.
  const [paintVersion, setPaintVersion] = useState(0);

  // Mirrors of the two state values above, kept current after every render
  // — undo()/redo() read these instead of the functional setState form, so
  // each state update below is a single top-level call rather than one
  // nested inside another updater (React can double-invoke an updater
  // under StrictMode, which would double-push onto the redo stack).
  const strokeHistoryRef = useRef(strokeHistory);
  strokeHistoryRef.current = strokeHistory;
  const redoStackRef = useRef(redoStack);
  redoStackRef.current = redoStack;

  function handleStrokeComplete(record: StrokeRecord) {
    setStrokeHistory((previous) => [...previous, record]); // live paint already reflects it — no replay needed here
    setRedoStack([]);
  }

  // Undoes the single most recent stroke, regardless of which layer it was
  // painted on (matching standard undo behavior) — pops it from the history
  // and rebuilds every layer's paint texture from what remains.
  function undo() {
    const history = strokeHistoryRef.current;
    if (history.length === 0) return;
    const popped = history[history.length - 1];
    const next = history.slice(0, -1);
    sceneHandleRef.current?.applyStrokeHistory(next);
    setStrokeHistory(next);
    setRedoStack([...redoStackRef.current, popped]);
    // Nothing else watches strokeHistory, so without this MapView's 2D
    // canvas would never know to re-read the texture after an undo.
    setPaintVersion((version) => version + 1);
  }

  // Replays the most recently undone stroke back onto strokeHistory — the
  // mirror of undo().
  function redo() {
    const pending = redoStackRef.current;
    if (pending.length === 0) return;
    const restored = pending[pending.length - 1];
    const nextHistory = [...strokeHistoryRef.current, restored];
    sceneHandleRef.current?.applyStrokeHistory(nextHistory);
    setStrokeHistory(nextHistory);
    setRedoStack(pending.slice(0, -1));
    setPaintVersion((version) => version + 1);
  }

  // Cmd+Z / Ctrl+Z for undo, Cmd+Shift+Z / Ctrl+Shift+Z for redo — same
  // shortcut across platforms, matching this app's existing convention
  // rather than the Windows-only Ctrl+Y.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- undo()/redo() read current state via the refs above, never stale
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
    redoStack,
    paintVersion,
    handleStrokeComplete,
    undo,
    redo,
  };
}
