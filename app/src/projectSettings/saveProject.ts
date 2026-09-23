import { useEffect, useRef, useState, type RefObject } from 'react';
import type { User } from 'firebase/auth';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';
import { createDefaultLayer, type NoiseLayer, type StrokeRecord } from '../map/heightmap';
import {
  deleteProject as deleteProjectFromFirestore,
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

// A generic, always-present name for a newly-created planet — "New Planet
// 01", "New Planet 02"... never a blank/unnamed state (Dana, 2026-09-22:
// naming and loading were conflated and needed separating; editable inline
// afterward via EditableText in Panel.tsx). TODO(DS): a "cute"
// procedurally-generated name generator is a nice future idea instead of
// this placeholder — see ROADMAP.md.
function generateProjectName(existingCount: number): string {
  return `New Planet ${String(existingCount + 1).padStart(2, '0')}`;
}

// Creates and saves a brand-new blank planet under a generic name, making it
// the currently-open one — shared by the zero-projects case on first load,
// "+ New Project", and deleting the last remaining planet, so there's always
// exactly one planet open.
async function createFreshProject(
  uid: string,
  existingCount: number,
  layers: NoiseLayer[],
  setCurrentPlanetId: (id: string) => void,
  setCurrentPlanetName: (name: string) => void,
): Promise<ProjectSummary> {
  const id = newProjectId();
  const name = generateProjectName(existingCount);
  await saveProjectToFirestore(uid, id, { name, layers, strokeHistory: [] });
  setCurrentPlanetId(id);
  setCurrentPlanetName(name);
  return { id, name, updatedAt: Date.now() };
}

// Persistence + multi-project management: which saved planet is open, the
// list of saved planets, and save/load/new/reset. Renaming is now inline
// (EditableText in Panel.tsx), not a separate button/flow. See ROADMAP.md,
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

  // Loads the signed-in user's most recently-edited saved planet, if any.
  // A brand-new user with no saved planets yet gets one created immediately,
  // under a generic auto-generated name — there's never an unnamed/unsaved
  // in-between state to manage. Replays the paint strokes synchronously,
  // before touching any React state — see SceneCanvasHandle.loadProject()'s
  // own comment for why (ISSUES.md, 2026-09-22).
  useEffect(() => {
    if (!currentUser) return;
    listProjects(currentUser.uid).then(async (summaries) => {
      const mostRecent = summaries[0];
      if (mostRecent) {
        setProjects(summaries);
        const project = await loadProject(currentUser.uid, mostRecent.id);
        if (project && project.layers.length > 0) {
          sceneHandleRef.current?.loadProject(project.layers, project.strokeHistory);
          setLayers(project.layers);
          setSelectedLayerId(project.layers[project.layers.length - 1].id); // top of the stack, matching the selection convention elsewhere
          setStrokeHistory(project.strokeHistory);
          setCurrentPlanetId(mostRecent.id);
          setCurrentPlanetName(project.name);
        }
      } else {
        const fresh = await createFreshProject(currentUser.uid, 0, layers, setCurrentPlanetId, setCurrentPlanetName);
        setProjects([fresh]);
      }
      hasLoadedRef.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters/layers are stable at initial mount, only currentUser should retrigger this
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
  // Returns the fresh layer stack so handleNewProject() can save it under
  // the new project's id.
  function clearCanvas() {
    const freshId = crypto.randomUUID();
    const freshLayers = [createDefaultLayer(freshId)];
    sceneHandleRef.current?.loadProject(freshLayers, []);
    setLayers(freshLayers);
    setSelectedLayerId(freshId);
    setStrokeHistory([]);
    return freshLayers;
  }

  // "+ New Project" — starts a blank planet under a generic auto-generated
  // name, saved immediately (no unnamed in-between state). Distinct from
  // Reset (below): this switches away from whatever planet was open and
  // adds a new entry to the project list; Reset clears the *current* one
  // in place.
  async function handleNewProject() {
    if (!currentUser) return;
    const freshLayers = clearCanvas();
    const fresh = await createFreshProject(currentUser.uid, projects.length, freshLayers, setCurrentPlanetId, setCurrentPlanetName);
    setProjects((previous) => [fresh, ...previous]);
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

  // Manual "just in case" save — the current planet is always already
  // named by this point (see the load effect and handleNewProject() above),
  // so there's no longer a name-prompt branch here.
  async function handleSave() {
    if (!currentUser || currentPlanetId === null) return;
    await saveProjectToFirestore(currentUser.uid, currentPlanetId, {
      name: currentPlanetName ?? 'Untitled',
      layers,
      strokeHistory,
    });
    setProjects(await listProjects(currentUser.uid));
  }

  // Inline rename (EditableText in Panel.tsx) — replaces the old prompt-
  // based Rename button/flow.
  async function handleRenameInline(name: string) {
    if (!currentUser || currentPlanetId === null) return;
    await renameProject(currentUser.uid, currentPlanetId, name);
    setCurrentPlanetName(name);
    setProjects((previous) => previous.map((project) => (project.id === currentPlanetId ? { ...project, name } : project)));
  }

  // Deletes a saved planet entirely — not just clearing its content, see
  // Reset above for that; this removes the Firestore document, confirmed
  // since it can't be undone. If the deleted planet was the open one,
  // switches to the next most-recently-updated remaining planet, or creates
  // a fresh one if none are left (mirrors the zero-projects case on load).
  async function handleDeleteProject(id: string) {
    if (!currentUser) return;
    if (!window.confirm("Delete this planet? This removes it entirely and can't be undone.")) return;
    await deleteProjectFromFirestore(currentUser.uid, id);
    const remaining = await listProjects(currentUser.uid);
    setProjects(remaining);
    if (id !== currentPlanetId) return; // deleted a planet other than the open one
    const next = remaining[0];
    if (next) {
      await handleSelectProject(next.id);
    } else {
      const freshLayers = clearCanvas();
      const fresh = await createFreshProject(currentUser.uid, 0, freshLayers, setCurrentPlanetId, setCurrentPlanetName);
      setProjects([fresh]);
    }
  }

  return {
    currentPlanetId,
    currentPlanetName,
    projects,
    handleNewProject,
    handleReset,
    handleSelectProject,
    handleSave,
    handleRenameInline,
    handleDeleteProject,
  };
}
