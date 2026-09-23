import { useRef } from 'react';
import { SceneCanvas, type SceneCanvasHandle } from './scene/SceneCanvas';
import { useSceneControls } from './scene/sceneControls';
import { useSharedGumball } from './scene/sharedGumball';
import { usePlanetControls } from './planet/planetControls';
import { Panel } from './ui/Panel';
import { RightPanel } from './ui/RightPanel';
import { useNoiseLayers } from './map/noiseLayers';
import { useBrush } from './map/2Dbrush';
import { useCurrentUser } from './firebase/currentUser';
import { useSaveProject } from './projectSettings/saveProject';
import { useLandChunk } from './voxel/landChunk';
import { LandChunkCanvas, type LandChunkCanvasHandle } from './voxel/LandChunkCanvas';
import { ViewModeControl } from './voxel/ViewModeControl';

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
  const landChunkHandleRef = useRef<LandChunkCanvasHandle>(null);

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
  const landChunk = useLandChunk(sceneHandleRef, noiseLayers.layers, planetControls.displayMode, planetControls.heightScale);
  const sharedGumball = useSharedGumball(sceneHandleRef, landChunkHandleRef, landChunk.viewMode);

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
        heightScale={planetControls.heightScale}
        onHeightScaleChange={planetControls.setHeightScale}
        canUndo={brush.strokeHistory.length > 0}
        onUndo={brush.undo}
        canRedo={brush.redoStack.length > 0}
        onRedo={brush.redo}
        onReset={project.handleReset}
        projects={project.projects}
        currentPlanetId={project.currentPlanetId}
        currentPlanetName={project.currentPlanetName}
        onSelectProject={project.handleSelectProject}
        onNewProject={project.handleNewProject}
        onSaveProject={project.handleSave}
        onRenameProject={project.handleRenameInline}
        onDeleteProject={project.handleDeleteProject}
        chunkResolution={landChunk.resolution}
        onChunkResolutionChange={landChunk.setResolution}
        chunkSize={landChunk.chunkSize}
        onChunkSizeChange={landChunk.setChunkSize}
      />
      {/* Planet and land-chunk panes are always mounted — the view-mode
          button (top-right) only toggles CSS visibility, never unmounts
          either — so switching modes doesn't rebuild the Three.js scene,
          reset the camera, or lose state (Dana, 2026-09-23). See
          ROADMAP.md, Stage 07. Click a pane to give the shared gumball
          (scene/sharedGumball.ts) its camera, shift+click to add the other
          pane too. Each canvas's own ResizeObserver picks up its pane's
          actual size. */}
      <div className="app-viewport" ref={sharedGumball.mountRef}>
        <div
          className={
            'planet-viewport' +
            (landChunk.viewMode === 'landChunk' ? ' viewport-pane--hidden' : '') +
            (landChunk.viewMode === 'split' && sharedGumball.selectedPanes.includes('planet') ? ' viewport-pane--selected' : '')
          }
          style={landChunk.viewMode === 'split' ? { flexGrow: 0, flexShrink: 0, flexBasis: `${landChunk.splitRatio * 100}%` } : undefined}
          onClick={(event) => sharedGumball.handlePaneClick('planet', event)}
        >
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
            heightScale={planetControls.heightScale}
          />
        </div>
        {landChunk.viewMode === 'split' && <div className="viewport-divider" onMouseDown={landChunk.startResize} />}
        <div
          className={
            'land-chunk-viewport' +
            (landChunk.viewMode === 'planet' ? ' viewport-pane--hidden' : '') +
            (landChunk.viewMode === 'split' && sharedGumball.selectedPanes.includes('landChunk') ? ' viewport-pane--selected' : '')
          }
          onClick={(event) => sharedGumball.handlePaneClick('landChunk', event)}
        >
          <LandChunkCanvas
            ref={landChunkHandleRef}
            geometry={landChunk.geometry}
            ambientLight={sceneControls.ambientLight}
            lightDirX={sceneControls.lightDirX}
            lightDirY={sceneControls.lightDirY}
            gridSpacing={sceneControls.gridSpacing}
            gridVisible={sceneControls.gridVisible}
            baseColor={planetControls.baseColor}
          />
        </div>
        <ViewModeControl viewMode={landChunk.viewMode} onChange={landChunk.setViewMode} />
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
