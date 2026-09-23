import { useEffect, useRef, useState, type RefObject } from 'react';
import type { User } from 'firebase/auth';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';
import { createDefaultLayer, type NoiseLayer, type StrokeRecord } from '../map/heightmap';
import {
  listProjects,
  loadProject,
  newProjectId,
  renameProject,
  saveProject as saveProjectToFirestore,
  type ProjectSummary,
} from '../firebase/storage';

interface UseSaveProjectArgs {
  currentUser: User | null;
  sceneHandleRef: RefObject<SceneCanvasHandle | null>;
  // Reads/writes into the layer-stack and paint-stroke state owned by
  // map/noiseLayers.ts and map/2Dbrush.ts — this hook orchestrates
  // persistence/project-switching, it doesn't own that state's day-to-day
  // editing logic. See ISSUES.md, 2026-09-22.
  layers: NoiseLayer[];
  setLayers: (layers: NoiseLayer[]) => void;
  setSelectedLayerId: (id: string) => void;
  strokeHistory: StrokeRecord[];
  setStrokeHistory: (strokeHistory: StrokeRecord[]) => void;
}

// Persistence + multi-project management: which saved planet is open, the
// list of saved planets, and save/load/rename/new/reset. See ROADMAP.md,
// Stage 06.
export function useSaveProject({
  currentUser,
  sceneHandleRef,
  layers,
  setLayers,
  setSelectedLayerId,
  strokeHistory,
  setStrokeHistory,
}: UseSaveProjectArgs) {
  const hasLoadedRef = useRef(false); // guards against saving the default layer over real saved data before the load below resolves
  // Which saved planet is open. null = a fresh, not-yet-saved planet — see
  // handleNewProject()/handleSave() below.
  const [currentPlanetId, setCurrentPlanetId] = useState<string | null>(null);
  const [currentPlanetName, setCurrentPlanetName] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]); // for the Project picker dropdown

  // Loads the signed-in user's most recently-edited saved planet, if any —
  // otherwise stays on the default blank starter layer. Replays the paint
  // strokes synchronously, before touching any React state — see
  // SceneCanvasHandle.loadProject()'s own comment for why (ISSUES.md, 2026-09-22).
  useEffect(() => {
    if (!currentUser) return;
    listProjects(currentUser.uid).then(async (summaries) => {
      setProjects(summaries);
      const mostRecent = summaries[0];
      if (mostRecent) {
        const project = await loadProject(currentUser.uid, mostRecent.id);
        if (project && project.layers.length > 0) {
          sceneHandleRef.current?.loadProject(project.layers, project.strokeHistory);
          setLayers(project.layers);
          setSelectedLayerId(project.layers[project.layers.length - 1].id); // top of the stack, matching the selection convention elsewhere
          setStrokeHistory(project.strokeHistory);
          setCurrentPlanetId(mostRecent.id);
          setCurrentPlanetName(project.name);
        }
      }
      hasLoadedRef.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters are stable, only currentUser should retrigger this
  }, [currentUser]);

  // Debounced save on every layer/stroke change, only once a planet has
  // actually been saved once (currentPlanetId set) — a fresh, unnamed
  // planet doesn't autosave until handleSave() names it. ~3s, not ~1s: this
  // only fires on a real change, and strokeHistory only changes once per
  // *completed* stroke (not per dab), so widening it just means fewer
  // writes during a burst of edits, not a meaningfully longer data-loss
  // window — see ROADMAP.md, Stage 06, for the fixed-interval alternative
  // considered and rejected.
  useEffect(() => {
    if (!currentUser || !hasLoadedRef.current || currentPlanetId === null) return;
    const timeoutId = setTimeout(() => {
      saveProjectToFirestore(currentUser.uid, currentPlanetId, {
        name: currentPlanetName ?? 'Untitled',
        layers,
        strokeHistory,
      });
    }, 3000);
    return () => clearTimeout(timeoutId);
  }, [layers, strokeHistory, currentUser, currentPlanetId, currentPlanetName]);

  // Shared by handleNewProject() and handleReset() — clears the canvas to
  // one blank default layer, no paint. Callers decide separately whether
  // the current planet's identity (currentPlanetId/Name) also resets.
  function clearCanvas() {
    const freshId = crypto.randomUUID();
    const freshLayers = [createDefaultLayer(freshId)];
    sceneHandleRef.current?.loadProject(freshLayers, []);
    setLayers(freshLayers);
    setSelectedLayerId(freshId);
    setStrokeHistory([]);
  }

  // The last option in the Project dropdown — starts a blank, unsaved
  // planet. Distinct from Reset (below): this switches away from whatever
  // planet was open, Reset clears the *current* one in place.
  function handleNewProject() {
    clearCanvas();
    setCurrentPlanetId(null);
    setCurrentPlanetName(null);
  }

  // Clears the *currently open* planet back to blank without switching
  // which saved planet is active — the next save overwrites it with this
  // blank state. Destructive and not part of the undo history, so confirmed.
  function handleReset() {
    if (!window.confirm("Reset this planet? This clears everything and can't be undone.")) return;
    clearCanvas();
  }

  async function handleSelectProject(id: string) {
    if (!currentUser || id === currentPlanetId) return;
    const project = await loadProject(currentUser.uid, id);
    if (!project) return;
    sceneHandleRef.current?.loadProject(project.layers, project.strokeHistory);
    const loadedLayers = project.layers.length > 0 ? project.layers : [createDefaultLayer(crypto.randomUUID())];
    setLayers(loadedLayers);
    setSelectedLayerId(loadedLayers[loadedLayers.length - 1].id);
    setStrokeHistory(project.strokeHistory);
    setCurrentPlanetId(id);
    setCurrentPlanetName(project.name);
  }

  // One button for both "Save As" and a manual "just in case" save: prompts
  // for a name only if the current planet doesn't have one yet.
  async function handleSave() {
    if (!currentUser) return;
    let planetId = currentPlanetId;
    let planetName = currentPlanetName;
    if (planetId === null) {
      const name = window.prompt('Name this planet:', 'Untitled');
      if (!name) return; // cancelled
      planetId = newProjectId();
      planetName = name;
    }
    await saveProjectToFirestore(currentUser.uid, planetId, { name: planetName ?? 'Untitled', layers, strokeHistory });
    setCurrentPlanetId(planetId);
    setCurrentPlanetName(planetName);
    setProjects(await listProjects(currentUser.uid));
  }

  async function handleRename() {
    if (!currentUser || currentPlanetId === null) return;
    const name = window.prompt('Rename planet:', currentPlanetName ?? '');
    if (!name) return;
    await renameProject(currentUser.uid, currentPlanetId, name);
    setCurrentPlanetName(name);
    setProjects(await listProjects(currentUser.uid));
  }

  return {
    currentPlanetId,
    currentPlanetName,
    projects,
    handleNewProject,
    handleReset,
    handleSelectProject,
    handleSave,
    handleRename,
  };
}
