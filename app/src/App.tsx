import { useEffect, useRef, useState } from 'react';
import { SceneCanvas, type SceneCanvasHandle } from './scene/SceneCanvas';
import { Panel } from './ui/Panel';
import { RightPanel } from './ui/RightPanel';
import { createDefaultLayer, type NoiseLayer } from './map/heightmap';
import { useCurrentUser } from './state/useCurrentUser';
import { loadLayers, saveLayers } from './state/storage';

// TODO(DS): arbitrary placeholder conversion — the UI shows/accepts a
// narrative-scale planet radius in km (the tool's premise, per Dana), mapped
// down to the small render-space units the scene actually uses. 1 scene
// unit = 300 km is a made-up round number chosen to land near the previous
// hardcoded default (~20 scene units) at an Earth-ish 6000km — not derived
// from anything. Revisit once there's a real scene-scale convention.
const KM_PER_SCENE_UNIT = 300;

const INITIAL_LAYER_ID = 'layer-1';

function App() {
  const currentUser = useCurrentUser(); // signs in anonymously on load — see state/useCurrentUser.ts
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
  const sceneHandleRef = useRef<SceneCanvasHandle>(null);

  // Loads the signed-in user's saved layer stack once, replacing the default
  // starter layer if one exists. See state/storage.ts.
  useEffect(() => {
    if (!currentUser) return;
    loadLayers(currentUser.uid).then((loaded) => {
      if (loaded && loaded.length > 0) {
        setLayers(loaded);
        setSelectedLayerId(loaded[loaded.length - 1].id); // top of the stack, matching the selection convention elsewhere
      }
      hasLoadedRef.current = true;
    });
  }, [currentUser]);

  // Debounced save on every layer change, only after the initial load above
  // has resolved — otherwise this would overwrite real saved data with the
  // default starter layer before loadLayers() had a chance to run.
  useEffect(() => {
    if (!currentUser || !hasLoadedRef.current) return;
    const timeoutId = setTimeout(() => saveLayers(currentUser.uid, layers), 1000);
    return () => clearTimeout(timeoutId);
  }, [layers, currentUser]);

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
      />
    </div>
  );
}

export default App;
