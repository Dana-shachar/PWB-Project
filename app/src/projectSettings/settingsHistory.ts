import { useEffect, useRef } from 'react';
import type { NoiseLayer } from '../map/heightmap';
import type { PlanetSettings } from '../planet/planetControls';
import type { SavedErosionRun } from '../firebase/storage';

// One undo timeline for the whole planet, as editors keep one (Photoshop's History, Blender's undo stack): settings changes
// and paint strokes in the order made. A settings change is recorded once it settles (a drag's end), not on every tick.
const SETTLE_MS = 400;

interface Snapshot {
  layers: NoiseLayer[];
  planet: PlanetSettings;
  erosion: Omit<SavedErosionRun, 'patch'>;
}

interface Args {
  layers: NoiseLayer[];
  setLayers: (layers: NoiseLayer[]) => void;
  planetSettings: PlanetSettings;
  applyPlanetSettings: (settings: PlanetSettings) => void;
  erosionSettings: Omit<SavedErosionRun, 'patch'>;
  applyErosionSettings: (settings: Omit<SavedErosionRun, 'patch'>) => void;
  // Which planet is open: a load or a new planet starts a fresh history.
  planetId: string | null;
  strokeCount: number;
  undoStroke: () => void;
  redoStroke: () => void;
}

type Step = { kind: 'stroke' } | { kind: 'settings'; before: Snapshot; after: Snapshot };

export function useSettingsHistory(args: Args): void {
  const argsRef = useRef(args);
  argsRef.current = args;
  const committedRef = useRef<{ snapshot: Snapshot; key: string } | null>(null);
  const undoRef = useRef<Step[]>([]);
  const redoRef = useRef<Step[]>([]);
  const restoringKeyRef = useRef<string | null>(null); // a restore's own change isn't recorded as a new step
  const strokeCountRef = useRef(args.strokeCount);

  const snapshot: Snapshot = { layers: args.layers, planet: args.planetSettings, erosion: args.erosionSettings };
  const key = JSON.stringify(snapshot);

  // A load or a new planet starts a fresh timeline, so Cmd+Z never undoes the load itself.
  useEffect(() => {
    undoRef.current = [];
    redoRef.current = [];
    committedRef.current = null;
    restoringKeyRef.current = null;
  }, [args.planetId]);

  // A new paint stroke joins the timeline as its own step.
  useEffect(() => {
    if (args.strokeCount > strokeCountRef.current && restoringKeyRef.current === null) {
      undoRef.current.push({ kind: 'stroke' });
      redoRef.current = [];
    }
    strokeCountRef.current = args.strokeCount;
  }, [args.strokeCount]);

  // A settings change, recorded once it settles.
  useEffect(() => {
    if (committedRef.current === null) {
      committedRef.current = { snapshot, key };
      return;
    }
    if (key === committedRef.current.key) {
      restoringKeyRef.current = null; // a restore that lands on the committed state is done
      return;
    }
    const timer = window.setTimeout(() => {
      const committed = committedRef.current!;
      if (restoringKeyRef.current !== null) {
        committedRef.current = { snapshot, key };
        restoringKeyRef.current = null;
        return;
      }
      undoRef.current.push({ kind: 'settings', before: committed.snapshot, after: snapshot });
      redoRef.current = [];
      committedRef.current = { snapshot, key };
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key stands for the whole snapshot
  }, [key]);

  useEffect(() => {
    function restore(target: Snapshot) {
      const current = argsRef.current;
      restoringKeyRef.current = JSON.stringify(target);
      current.setLayers(target.layers);
      current.applyPlanetSettings(target.planet);
      current.applyErosionSettings(target.erosion);
    }
    function step(from: Step[], to: Step[], undo: boolean) {
      const last = from.pop();
      if (!last) return;
      to.push(last);
      if (last.kind === 'stroke') {
        if (undo) argsRef.current.undoStroke();
        else argsRef.current.redoStroke();
      } else restore(undo ? last.before : last.after);
    }
    // Cmd+Z / Ctrl+Z undoes, with Shift redoes, the same shortcut on every platform. Typing in a field keeps its own undo.
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range' || target.tagName === 'TEXTAREA')) return;
      event.preventDefault();
      if (event.shiftKey) step(redoRef.current, undoRef.current, false);
      else step(undoRef.current, redoRef.current, true);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
