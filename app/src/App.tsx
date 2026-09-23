import { useRef } from 'react';
import { SceneCanvas, type SceneCanvasHandle } from './scene/SceneCanvas';
import { useSceneControls } from './scene/sceneControls';
import { usePlanetControls } from './planet/planetControls';
import { Panel } from './ui/Panel';
import { RightPanel } from './ui/RightPanel';
import { useNoiseLayers } from './map/noiseLayers';
import { useBrush } from './map/2Dbrush';
import { useCurrentUser } from './firebase/useCurrentUser';
import { useSaveProject } from './projectSettings/saveProject';

const INITIAL_LAYER_ID = 'layer-1';

// Composition root only — every feature owns its own state/logic in its own
// hook; this file just calls them and wires the results into the UI tree.
// Never add state or handler logic directly here — see ISSUES.md,
// 2026-09-22, for why (App.tsx had become a five-feature monolith before
// this split), and README.md's code-organization section for the standing
// rule this now codifies.
function App() {
  const currentUser = useCurrentUser(); // signs in anonymously on load — see firebase/useCurrentUser.ts
  const sceneHandleRef = useRef<SceneCanvasHandle>(null);

  const sceneControls = useSceneControls();
  const planetControls = usePlanetControls();
  const noiseLayers = useNoiseLayers(INITIAL_LAYER_ID);
  const brush = useBrush(sceneHandleRef);
  const project = useSaveProject({
    currentUser,
    sceneHandleRef,
    layers: noiseLayers.layers,
    setLayers: noiseLayers.setLayers,
    setSelectedLayerId: noiseLayers.setSelectedLayerId,
    strokeHistory: brush.strokeHistory,
    setStrokeHistory: brush.setStrokeHistory,
  });

  return (
    <div className="app-layout">
      <Panel
        ambientLight={sceneControls.ambientLight}
        onAmbientLightChange={sceneControls.setAmbientLight}
        lightDirX={sceneControls.lightDirX}
        onLightDirXChange={sceneControls.setLightDirX}
        lightDirY={sceneControls.lightDirY}
        onLightDirYChange={sceneControls.setLightDirY}
        gridSpacing={sceneControls.gridSpacing}
        onGridSpacingChange={sceneControls.setGridSpacing}
        gridVisible={sceneControls.gridVisible}
        onGridVisibleChange={sceneControls.setGridVisible}
        radiusKm={planetControls.radiusKm}
        onRadiusKmChange={planetControls.setRadiusKm}
        baseColor={planetControls.baseColor}
        onBaseColorChange={planetControls.setBaseColor}
        displayMode={planetControls.displayMode}
        onDisplayModeChange={planetControls.setDisplayMode}
        canUndo={brush.strokeHistory.length > 0}
        onUndo={brush.undo}
        onReset={project.handleReset}
        projects={project.projects}
        currentPlanetId={project.currentPlanetId}
        currentPlanetName={project.currentPlanetName}
        onSelectProject={project.handleSelectProject}
        onNewProject={project.handleNewProject}
        onSaveProject={project.handleSave}
        onRenameProject={project.handleRename}
      />
      {/* The 3D viewport fills the remaining space between the two panels —
          SceneCanvas's ResizeObserver picks up this box's actual size, so
          the camera centers on what's actually visible. */}
      <div className="app-viewport">
        <SceneCanvas
          ref={sceneHandleRef}
          radius={planetControls.radiusScene}
          baseColor={planetControls.baseColor}
          ambientLight={sceneControls.ambientLight}
          lightDirX={sceneControls.lightDirX}
          lightDirY={sceneControls.lightDirY}
          displayMode={planetControls.displayMode}
          gridSpacing={sceneControls.gridSpacing}
          gridVisible={sceneControls.gridVisible}
          layers={noiseLayers.layers}
        />
      </div>
      <RightPanel
        layers={noiseLayers.layers}
        selectedLayerId={noiseLayers.selectedLayerId}
        onSelectLayer={noiseLayers.setSelectedLayerId}
        onAddLayer={noiseLayers.addLayer}
        onDeleteLayer={noiseLayers.deleteLayer}
        onReorderLayer={noiseLayers.reorderLayer}
        onUpdateSelectedLayer={noiseLayers.updateSelectedLayer}
        brushRadiusPx={brush.brushRadiusPx}
        onBrushRadiusPxChange={brush.setBrushRadiusPx}
        brushValue={brush.brushValue}
        onBrushValueChange={brush.setBrushValue}
        feather={brush.feather}
        onFeatherChange={brush.setFeather}
        sceneHandleRef={sceneHandleRef}
        onStrokeComplete={brush.handleStrokeComplete}
        paintVersion={brush.paintVersion}
      />
    </div>
  );
}

export default App;
