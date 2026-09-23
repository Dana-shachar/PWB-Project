import { useEffect, useRef, useState } from 'react';
import { SceneCanvas, type SceneCanvasHandle } from './scene/SceneCanvas';
import { Panel } from './ui/Panel';
import { RightPanel } from './ui/RightPanel';
import { createDefaultLayer, type NoiseLayer, type StrokeRecord } from './map/heightmap';
import { useCurrentUser } from './firebase/useCurrentUser';
import { loadProject, saveProject } from './firebase/storage';

// TODO(DS): arbitrary placeholder conversion — the UI shows/accepts a
// narrative-scale planet radius in km (the tool's premise, per Dana), mapped
// down to the small render-space units the scene actually uses. 1 scene
// unit = 300 km is a made-up round number chosen to land near the previous
// hardcoded default (~20 scene units) at an Earth-ish 6000km — not derived
// from anything. Revisit once there's a real scene-scale convention.
const KM_PER_SCENE_UNIT = 300;

const INITIAL_LAYER_ID = 'layer-1';

function App() {
  const currentUser = useCurrentUser(); // signs in anonymously on load — see firebase/useCurrentUser.ts
  const hasLoadedRef = useRef(false); // guards against saving the default layer over real saved data before the load below resolves
  const [radiusKm, setRadiusKm] = useState(6000);
  const [baseColor, setBaseColor] = useState('#c9dbea'); // TODO(DS): lighter placeholder, per Dana's 2026-09-16 request
  const [ambientLight, setAmbientLight] = useState(0.12); // lower = more shadow contrast on the bumps
  const [lightDirX, setLightDirX] = useState(1);
  const [lightDirY, setLightDirY] = useState(1);
  const [displayMode, setDisplayMode] = useState('shaded'); // 'shaded' | 'wireframe'
  const [gridSpacing, setGridSpacing] = useState(10);
  const [gridVisible, setGridVisible] = useState(true);
  const [layers, setLayers] = useState<NoiseLayer[]>([createDefaultLayer(INITIAL_LAYER_ID)]);
  const [selectedLayerId, setSelectedLayerId] = useState(INITIAL_LAYER_ID);
  const [brushRadiusPx, setBrushRadiusPx] = useState(20); // TODO(DS): arbitrary placeholder default
  const [brushValue, setBrushValue] = useState(1); // -1 (erase/black) .. 1 (paint/white)
  const [feather, setFeather] = useState(1); // 0=hard edge, 1=fully soft — a fraction of brushRadiusPx
  // Every completed stroke, across all layers, in the order painted — the
  // retraceable source of truth for painted terrain (not just a baked
  // raster), and what Cmd+Z undoes from. See ROADMAP.md, Stage 06.
  const [strokeHistory, setStrokeHistory] = useState<StrokeRecord[]>([]);
  const sceneHandleRef = useRef<SceneCanvasHandle>(null);
  // A loaded project's stroke history, waiting for SceneCanvas's own
  // layers-effect to create that project's paint targets before it's safe
  // to replay — consumed by the effect below once `layers` actually
  // changes (React runs a child's effects before its parent's within the
  // same commit, so SceneCanvas's targets already exist by then).
  const pendingReplayRef = useRef<StrokeRecord[] | null>(null);

  // Loads the signed-in user's saved project once, replacing the default
  // starter layer if one exists. See firebase/storage.ts.
  useEffect(() => {
    if (!currentUser) return;
    loadProject(currentUser.uid).then((project) => {
      if (project && project.layers.length > 0) {
        setLayers(project.layers);
        setSelectedLayerId(project.layers[project.layers.length - 1].id); // top of the stack, matching the selection convention elsewhere
        setStrokeHistory(project.strokeHistory);
        pendingReplayRef.current = project.strokeHistory;
      }
      hasLoadedRef.current = true;
    });
  }, [currentUser]);

  // Replays a just-loaded project's paint strokes once the layer change
  // above has actually taken effect (and so SceneCanvas has created paint
  // targets for those layers) — see pendingReplayRef's comment.
  useEffect(() => {
    if (pendingReplayRef.current === null) return;
    const toReplay = pendingReplayRef.current;
    pendingReplayRef.current = null;
    sceneHandleRef.current?.applyStrokeHistory(toReplay);
  }, [layers]);

  // Debounced save on every layer/stroke change, only after the initial load
  // above has resolved — otherwise this would overwrite real saved data with
  // the default starter layer before loadProject() had a chance to run.
  useEffect(() => {
    if (!currentUser || !hasLoadedRef.current) return;
    const timeoutId = setTimeout(() => saveProject(currentUser.uid, { layers, strokeHistory }), 1000);
    return () => clearTimeout(timeoutId);
  }, [layers, strokeHistory, currentUser]);

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
  }, []);

  function addLayer() {
    const id = crypto.randomUUID();
    setLayers([...layers, createDefaultLayer(id)]); // appended at the end — top of the stack
    setSelectedLayerId(id);
  }

  function deleteLayer(id: string) {
    if (layers.length === 1) return; // always keep at least one layer
    const remaining = layers.filter((layer) => layer.id !== id);
    setLayers(remaining);
    if (selectedLayerId === id) {
      setSelectedLayerId(remaining[remaining.length - 1].id);
    }
  }

  // Moves draggedId to targetId's position in the stack — drag-to-reorder,
  // called continuously as the pointer moves over other rows in NoisePanel.
  function reorderLayer(draggedId: string, targetId: string) {
    const draggedIndex = layers.findIndex((layer) => layer.id === draggedId);
    const targetIndex = layers.findIndex((layer) => layer.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return;
    const reordered = [...layers];
    const [dragged] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, dragged);
    setLayers(reordered);
  }

  function updateSelectedLayer(patch: Partial<NoiseLayer>) {
    setLayers(layers.map((layer) => (layer.id === selectedLayerId ? { ...layer, ...patch } : layer)));
  }

  return (
    <div className="app-layout">
      <Panel
        ambientLight={ambientLight}
        onAmbientLightChange={setAmbientLight}
        lightDirX={lightDirX}
        onLightDirXChange={setLightDirX}
        lightDirY={lightDirY}
        onLightDirYChange={setLightDirY}
        gridSpacing={gridSpacing}
        onGridSpacingChange={setGridSpacing}
        gridVisible={gridVisible}
        onGridVisibleChange={setGridVisible}
        radiusKm={radiusKm}
        onRadiusKmChange={setRadiusKm}
        baseColor={baseColor}
        onBaseColorChange={setBaseColor}
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
        canUndo={strokeHistory.length > 0}
        onUndo={undo}
      />
      {/* The 3D viewport fills the remaining space between the two panels —
          SceneCanvas's ResizeObserver picks up this box's actual size, so
          the camera centers on what's actually visible. */}
      <div className="app-viewport">
        <SceneCanvas
          ref={sceneHandleRef}
          radius={radiusKm / KM_PER_SCENE_UNIT}
          baseColor={baseColor}
          ambientLight={ambientLight}
          lightDirX={lightDirX}
          lightDirY={lightDirY}
          displayMode={displayMode}
          gridSpacing={gridSpacing}
          gridVisible={gridVisible}
          layers={layers}
        />
      </div>
      <RightPanel
        layers={layers}
        selectedLayerId={selectedLayerId}
        onSelectLayer={setSelectedLayerId}
        onAddLayer={addLayer}
        onDeleteLayer={deleteLayer}
        onReorderLayer={reorderLayer}
        onUpdateSelectedLayer={updateSelectedLayer}
        brushRadiusPx={brushRadiusPx}
        onBrushRadiusPxChange={setBrushRadiusPx}
        brushValue={brushValue}
        onBrushValueChange={setBrushValue}
        feather={feather}
        onFeatherChange={setFeather}
        sceneHandleRef={sceneHandleRef}
        onStrokeComplete={handleStrokeComplete}
      />
    </div>
  );
}

export default App;
