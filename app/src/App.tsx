import type * as THREE from 'three';
import type { TerrainPatch } from './planet/patch';
import { useRef, useState } from 'react';
import { SceneCanvas, type SceneCanvasHandle } from './scene/SceneCanvas';
import { useSceneControls } from './scene/sceneControls';
import { useSharedGumball } from './scene/sharedGumball';
import { useSharedViewportRenderer } from './scene/sharedViewportRenderer';
import { usePlanetControls } from './planet/planetControls';
import { Panel } from './ui/Panel';
import { RightPanel } from './ui/RightPanel';
import { usePanelResize, useDockHeightResize } from './ui/panelResize';
import { PIPELINE_STAGES, type PipelineStage } from './ui/pipelineStages';
import { useNoiseLayers } from './map/noiseLayers';
import { MapView } from './map/MapView';
import { useBrush } from './map/2Dbrush';
import { useCurrentUser } from './firebase/currentUser';
import { useSaveProject } from './projectSettings/saveProject';
import { useErosion } from './erosion/erosionControls';
import { ErosionTimeline } from './erosion/ErosionTimeline';
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
  // Each pane's own layout box (.planet-viewport/.land-chunk-viewport below)
  // doubles as its viewport rect for the one shared renderer, and as the DOM
  // element its own OrbitControls listens on — see scene/
  // sharedViewportRenderer.ts for why neither canvas owns these anymore.
  const planetViewportRef = useRef<HTMLDivElement>(null);
  const chunkViewportRef = useRef<HTMLDivElement>(null);

  const sceneControls = useSceneControls();
  const planetControls = usePlanetControls();
  const noiseLayers = useNoiseLayers(INITIAL_LAYER_ID);
  const brush = useBrush(sceneHandleRef);
  // Declared before the land chunk, which consumes its result: erosion runs
  // on the patch the chunk is showing, and that patch reaches it as a prop
  // through the panel rather than the two hooks depending on each other.
  const erosion = useErosion(sceneHandleRef, noiseLayers.layers, brush.paintVersion);
  const landChunk = useLandChunk(
    sceneHandleRef,
    noiseLayers.layers,
    planetControls.displayMode,
    planetControls.heightScale,
    erosion.result,
    planetControls.detailAmount,
  );
  // The chunk's patches bake through the planet view's heightmap pipeline.
  const bakeChunkPatch = (patch: TerrainPatch, target: THREE.WebGLRenderTarget) => sceneHandleRef.current?.bakePatchInto(patch, target) ?? false;
  // Declared after erosion/landChunk, which it persists alongside layers and
  // paint — see projectSettings/saveProject.ts.
  const project = useSaveProject({
    currentUser,
    sceneHandleRef,
    layers: noiseLayers.layers,
    setLayers: noiseLayers.setLayers,
    setSelectedLayerIds: noiseLayers.setSelectedLayerIds,
    strokeHistory: brush.strokeHistory,
    setStrokeHistory: brush.setStrokeHistory,
    erosion,
    landChunk,
    planetControls,
  });
  const sharedGumball = useSharedGumball(sceneHandleRef, landChunkHandleRef, landChunk.viewMode);
  // One real renderer for both panes, reusing sharedGumball's own mountRef
  // (.app-viewport) as the container rather than attaching a second ref to
  // the same element. This is also what makes a patch's baked GPU texture
  // usable directly by the land chunk's own material again — see
  // scene/sharedViewportRenderer.ts and ISSUES.md, [B32].
  const sharedViewportRenderer = useSharedViewportRenderer(sharedGumball.mountRef);
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

  // The global bottom timeline dock (design.css's .app-timeline-dock) — a
  // full-width strip below the whole left/viewport/right row, not a widget
  // inside RightPanel, matching the AE/Premiere/C4D convention (Dana,
  // 2026-10-14). Mounts whenever the currently active stage is time-based,
  // not hardcoded to Erosion, so a future stage reuses this by flipping
  // PIPELINE_STAGES' hasTimeline rather than rebuilding the dock.
  const activeStageHasTimeline = PIPELINE_STAGES.find((stage) => stage.key === activeStage)?.hasTimeline ?? false;
  // Drag-to-resize for the dock's own height, same pattern as the side
  // panels' own width resize, with a floor so it can't be dragged down to
  // unusably small (Dana, 2026-10-14: "the timeline should be stretchable
  // like the side panels are w a minimal height enforced").
  const timelineDock = useDockHeightResize(240);

  return (
    <div className="app-shell">
    <div className="app-layout">
      <Panel
        ambientLight={sceneControls.ambientLight}
        onAmbientLightChange={sceneControls.setAmbientLight}
        lightDirX={sceneControls.lightDirX}
        onLightDirXChange={sceneControls.setLightDirX}
        lightDirY={sceneControls.lightDirY}
        onLightDirYChange={sceneControls.setLightDirY}
        lightDirZ={sceneControls.lightDirZ}
        onLightDirZChange={sceneControls.setLightDirZ}
        chunkLightDirZ={sceneControls.chunkLightDirZ}
        onChunkLightDirZChange={sceneControls.setChunkLightDirZ}
        lightIntensity={sceneControls.lightIntensity}
        onLightIntensityChange={sceneControls.setLightIntensity}
        specularStrength={sceneControls.specularStrength}
        onSpecularStrengthChange={sceneControls.setSpecularStrength}
        shininess={sceneControls.shininess}
        onShininessChange={sceneControls.setShininess}
        diffuseWrap={sceneControls.diffuseWrap}
        onDiffuseWrapChange={sceneControls.setDiffuseWrap}
        gridSpacing={sceneControls.gridSpacing}
        onGridSpacingChange={sceneControls.setGridSpacing}
        gridVisible={sceneControls.gridVisible}
        onGridVisibleChange={sceneControls.setGridVisible}
        walkFieldOfView={sceneControls.walkFieldOfView}
        onWalkFieldOfViewChange={sceneControls.setWalkFieldOfView}
        radiusKm={planetControls.radiusKm}
        onRadiusKmChange={planetControls.setRadiusKm}
        baseColor={planetControls.baseColor}
        onBaseColorChange={planetControls.setBaseColor}
        displayMode={planetControls.displayMode}
        onDisplayModeChange={planetControls.setDisplayMode}
        onRandomizeTerrain={noiseLayers.randomizeTerrain}
        colorByElevation={planetControls.colorByElevation}
        onColorByElevationChange={planetControls.setColorByElevation}
        colorStops={planetControls.colorStops}
        onColorStopsChange={planetControls.setColorStops}
        onRandomizeColors={planetControls.randomizeColors}
        shadowsEnabled={planetControls.shadowsEnabled}
        onShadowsEnabledChange={planetControls.setShadowsEnabled}
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
        maxErrorPixels={planetControls.maxErrorPixels}
        onMaxErrorPixelsChange={planetControls.setMaxErrorPixels}
        autoDetail={planetControls.autoDetail}
        onAutoDetailChange={planetControls.setAutoDetail}
        detailAmount={planetControls.detailAmount}
        onDetailAmountChange={planetControls.setDetailAmount}
        chunkSize={landChunk.chunkSize}
        onChunkSizeChange={landChunk.setChunkSize}
        heightScale={planetControls.heightScale}
        planetElevationRange={planetControls.elevationRange}
        chunkElevationRange={{ min: landChunk.elevationMin, max: landChunk.elevationMax }}
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
              ref={planetViewportRef}
              className={
                'planet-viewport' +
                (landChunk.viewMode === 'landChunk' ? ' viewport-pane--hidden' : '') +
                (landChunk.viewMode === 'split' && sharedGumball.selectedPanes.includes('planet') ? ' viewport-pane--selected' : '')
              }
              style={landChunk.viewMode === 'split' ? { flexGrow: 0, flexShrink: 0, flexBasis: `${landChunk.splitRatio * 100}%` } : undefined}
              onClick={(event) => sharedGumball.handlePaneClick('planet', event)}
              /* Double-click picks which piece of the planet the chunk
                 shows. Double rather than single so it doesn't collide with
                 the existing click-to-select-pane. See voxel/landChunk.ts. */
              onDoubleClick={(event) => landChunk.pickLocation(event.clientX, event.clientY)}
            >
              <SceneCanvas
                ref={sceneHandleRef}
                viewportRef={planetViewportRef}
                sharedRenderer={sharedViewportRenderer}
                radius={planetControls.radiusScene}
                maxErrorPixels={planetControls.effectiveMaxErrorPixels}
                baseColor={planetControls.baseColor}
                ambientLight={sceneControls.ambientLight}
                lightDirX={sceneControls.lightDirX}
                lightDirY={sceneControls.lightDirY}
                lightDirZ={sceneControls.lightDirZ}
                lightIntensity={sceneControls.lightIntensity}
                specularStrength={sceneControls.specularStrength}
                shininess={sceneControls.shininess}
                diffuseWrap={sceneControls.diffuseWrap}
                displayMode={planetControls.displayMode}
                gridSpacing={sceneControls.gridSpacing}
                gridVisible={sceneControls.gridVisible}
                layers={noiseLayers.layers}
                heightScale={planetControls.heightScale}
                detailAmount={planetControls.detailAmount}
                colorByElevation={planetControls.colorByElevation}
                colorStops={planetControls.colorStops}
                onElevationRangeChange={planetControls.setElevationRange}
              />
            </div>
            {landChunk.viewMode === 'split' && <div className="viewport-divider" onMouseDown={landChunk.startResize} />}
            <div
              ref={chunkViewportRef}
              className={
                'land-chunk-viewport' +
                (landChunk.viewMode === 'planet' ? ' viewport-pane--hidden' : '') +
                (landChunk.viewMode === 'split' && sharedGumball.selectedPanes.includes('landChunk') ? ' viewport-pane--selected' : '')
              }
              onClick={(event) => sharedGumball.handlePaneClick('landChunk', event)}
            >
              <LandChunkCanvas
                ref={landChunkHandleRef}
                viewportRef={chunkViewportRef}
                sharedRenderer={sharedViewportRenderer}
                geometry={landChunk.geometry}
                ambientLight={sceneControls.ambientLight}
                lightDirX={sceneControls.lightDirX}
                lightDirY={sceneControls.lightDirY}
                lightDirZ={sceneControls.chunkLightDirZ}
                lightIntensity={sceneControls.lightIntensity}
                specularStrength={sceneControls.specularStrength}
                shininess={sceneControls.shininess}
                diffuseWrap={sceneControls.diffuseWrap}
                gridSpacing={sceneControls.gridSpacing}
                gridVisible={sceneControls.gridVisible}
                walkFieldOfView={sceneControls.walkFieldOfView}
                baseColor={planetControls.baseColor}
                heightMap={landChunk.heightMap}
                heightMapResolution={landChunk.heightMapResolution}
                heightMapGreenChannel={planetControls.displayMode !== 'voxel'}
                chunkSize={landChunk.chunkSize}
                maxHeight={landChunk.maxHeight}
                colorByElevation={planetControls.colorByElevation}
                colorStops={planetControls.colorStops}
                elevationMin={landChunk.elevationMin}
                elevationMax={landChunk.elevationMax}
                shadowsEnabled={planetControls.shadowsEnabled}
                patch={landChunk.patch}
                patchesEnabled={planetControls.displayMode !== 'voxel'}
                bakeVersion={landChunk.bakeVersion}
                maxErrorPixels={planetControls.effectiveMaxErrorPixels}
                bakePatch={bakeChunkPatch}
                groundHeights={landChunk.groundHeights}
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
        onUpdateLayers={noiseLayers.updateLayers}
        onRandomizeTerrain={noiseLayers.randomizeTerrain}
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
        erosion={erosion}
        erosionPatch={landChunk.patch}
        chunkMeshResolution={planetControls.displayMode === 'voxel' ? landChunk.resolution : null}
        width={rightPanel.width}
      />
    </div>
    {activeStageHasTimeline && (
      <>
      <div className="app-timeline-dock-handle" onMouseDown={timelineDock.startResize} />
      <div className="app-timeline-dock" style={{ height: timelineDock.height }}>
        <ErosionTimeline
          result={erosion.result}
          onScrub={erosion.scrubTo}
          isStale={erosion.isStale}
          onRun={() => erosion.run(landChunk.patch)}
          onReset={erosion.clear}
        />
      </div>
      </>
    )}
    </div>
  );
}

export default App;
