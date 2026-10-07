import { useRef, useState } from 'react';
import { SceneCanvas, type SceneCanvasHandle } from './scene/SceneCanvas';
import { useSceneControls } from './scene/sceneControls';
import { useSharedGumball } from './scene/sharedGumball';
import { usePlanetControls } from './planet/planetControls';
import { Panel } from './ui/Panel';
import { RightPanel } from './ui/RightPanel';
import { usePanelResize } from './ui/panelResize';
import { PIPELINE_STAGES, type PipelineStage } from './ui/pipelineStages';
import { useNoiseLayers } from './map/noiseLayers';
import { MapView } from './map/MapView';
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
    setSelectedLayerIds: noiseLayers.setSelectedLayerIds,
    strokeHistory: brush.strokeHistory,
    setStrokeHistory: brush.setStrokeHistory,
  });
  const landChunk = useLandChunk(sceneHandleRef, noiseLayers.layers, planetControls.displayMode, planetControls.heightScale);
  const sharedGumball = useSharedGumball(sceneHandleRef, landChunkHandleRef, landChunk.viewMode);
  // Drives the shared Radius/Size slider (ui/Panel.tsx) — whichever pane is
  // singly in view/selected, or null (disabled) when both are selected in
  // Split, since that slider is view-specific, not a joint control.
  const activeViewContext =
    landChunk.viewMode !== 'split'
      ? landChunk.viewMode
      : sharedGumball.selectedPanes.length === 1
        ? sharedGumball.selectedPanes[0]
        : null;
  // "Expand" (ui/NoisePanel.tsx) replaces the 3D viewport's content with the
  // full-size noise canvas instead of opening a dark overlay on top of
  // everything — both side panels stay visible either way (Dana, 2026-09-24:
  // "should instead replace the 3D viewport's content, keeping both side
  // panels visible"). Lives here, not in NoisePanel, since it changes what
  // this component renders in .app-viewport, not just something local to
  // the right panel.
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const primaryLayerId = noiseLayers.selectedLayerIds[noiseLayers.selectedLayerIds.length - 1];
  // Drag-to-resize (ui/panelResize.ts) — width only ever changes via an
  // explicit drag, never auto-adjusted by content (Dana, 2026-09-30). Both
  // panels share the same lowered 280px min/starting width (Dana,
  // 2026-09-30: "add the same fix to the right panel - inc 280 min").
  const leftPanel = usePanelResize(280, 'left', 280);
  const rightPanel = usePanelResize(280, 'right', 280);
  // The left panel's pipeline-stage menu — the structural response to
  // "reads as 3D software, not a procedural system" feedback (see
  // ROADMAP.md's Procedural System Feedback section). activeStage drives
  // which stage's detail RightPanel shows; stageEnabled is independent —
  // any combination can be on at once (feeds the future Timeline/gating,
  // not built yet). Terrain starts enabled since it's the only stage with
  // real content today.
  const [activeStage, setActiveStage] = useState<PipelineStage>('terrain');
  const [stageEnabled, setStageEnabled] = useState<Record<PipelineStage, boolean>>(() =>
    Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage.key, stage.key === 'terrain'])) as Record<PipelineStage, boolean>,
  );
  function handleToggleStageEnabled(stage: PipelineStage, value: boolean) {
    setStageEnabled((previous) => ({ ...previous, [stage]: value }));
  }

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
        activeViewContext={activeViewContext}
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
        activeStage={activeStage}
        onStageChange={setActiveStage}
        stageEnabled={stageEnabled}
        onToggleStageEnabled={handleToggleStageEnabled}
        width={leftPanel.width}
      />
      <div className="viewport-divider" onMouseDown={leftPanel.startResize} />
      {/* Planet and land-chunk panes are always mounted — the view-mode
          button (top-right) only toggles CSS visibility, never unmounts
          either — so switching modes doesn't rebuild the Three.js scene,
          reset the camera, or lose state (Dana, 2026-09-23). See
          ROADMAP.md, Stage 07. Click a pane to give the shared gumball
          (scene/sharedGumball.ts) its camera, shift+click to add the other
          pane too. Each canvas's own ResizeObserver picks up its pane's
          actual size. */}
      <div className={'app-viewport' + (isMapExpanded ? ' app-viewport--map-expanded' : '')} ref={sharedGumball.mountRef}>
        {isMapExpanded ? (
          <div className="map-expanded-viewport">
            <div className="noise-canvas-overlay-header">
              <span>Noise canvas</span>
              <button type="button" className="panel-text-btn" onClick={() => setIsMapExpanded(false)}>
                Collapse
              </button>
            </div>
            {/* Caps how wide the canvas grows in this much larger viewport
                area — MapView itself fills 100% of whatever contains it. */}
            <div className="map-expanded-canvas-wrap">
              <MapView
                layers={noiseLayers.layers}
                selectedLayerId={primaryLayerId}
                brushRadiusPx={brush.brushRadiusPx}
                brushValue={brush.brushValue}
                feather={brush.feather}
                sceneHandleRef={sceneHandleRef}
                onStrokeComplete={brush.handleStrokeComplete}
                paintVersion={brush.paintVersion}
              />
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
      <div className="viewport-divider" onMouseDown={rightPanel.startResize} />
      <RightPanel
        activeStage={activeStage}
        layers={noiseLayers.layers}
        selectedLayerIds={noiseLayers.selectedLayerIds}
        onLayerClick={noiseLayers.handleLayerClick}
        onAddLayer={noiseLayers.addLayer}
        onDeleteLayer={noiseLayers.deleteLayer}
        onToggleLayerVisible={noiseLayers.toggleLayerVisible}
        onRenameLayer={noiseLayers.renameLayer}
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
        heightScale={planetControls.heightScale}
        onHeightScaleChange={planetControls.setHeightScale}
        isMapExpanded={isMapExpanded}
        onMapExpandedChange={setIsMapExpanded}
        width={rightPanel.width}
      />
    </div>
  );
}

export default App;
