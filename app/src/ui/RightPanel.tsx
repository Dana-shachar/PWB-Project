import type { RefObject } from 'react';
import { NoisePanel } from './NoisePanel';
import { ErosionPanel } from './panels/ErosionPanel';
import { StagePlaceholder } from './panels/StagePlaceholder';
import { PIPELINE_STAGES, type PipelineStage } from './pipelineStages';
import type { NoiseLayer, StrokeRecord } from '../map/heightmap';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';
import type { useErosion } from '../erosion/erosionControls';
import type { TerrainPatch } from '../planet/patch';

interface RightPanelProps {
  // Which stage's detail to show — selected via the left panel's pipeline
  // menu (ui/Panel.tsx), not this panel's own tab bar anymore (removed
  // 2026-10-07 — keeping both would mean two sources of truth for the same
  // selection; see ROADMAP.md's Procedural System Feedback section).
  activeStage: PipelineStage;
  layers: NoiseLayer[];
  selectedLayerIds: string[];
  onLayerClick: (id: string, event: { shiftKey: boolean }) => void;
  onAddLayer: () => void;
  onDeleteLayer: (id: string) => void;
  onToggleLayerVisible: (id: string) => void;
  onRenameLayer: (id: string, name: string) => void;
  onReorderLayer: (draggedId: string, targetId: string) => void;
  onUpdateSelectedLayer: (patch: Partial<NoiseLayer>) => void;
  onRandomizeTerrain: () => void;
  brushRadiusPx: number;
  onBrushRadiusPxChange: (value: number) => void;
  brushValue: number;
  onBrushValueChange: (value: number) => void;
  feather: number;
  onFeatherChange: (value: number) => void;
  sceneHandleRef: RefObject<SceneCanvasHandle | null>;
  onStrokeComplete: (record: StrokeRecord) => void;
  paintVersion: number;
  heightScale: number;
  onHeightScaleChange: (value: number) => void;
  isMapExpanded: boolean;
  onMapExpandedChange: (value: boolean) => void;
  // The Erosion stage's whole feature, passed as one bundle rather than ten
  // separate props — it is one hook's result being handed to one panel, and
  // this component only forwards it.
  erosion: ReturnType<typeof useErosion>;
  // Which piece of ground erosion runs on, and how finely the chunk draws
  // it. Both belong to the land chunk, which is where the piece is chosen.
  erosionPatch: TerrainPatch;
  chunkMeshResolution: number;
  // User-resizable, not content-driven — see ui/panelResize.ts and App.tsx's
  // resize handle.
  width: number;
}

// Right-side panel — no tab bar of its own anymore; which stage's detail
// shows here is driven entirely by the left panel's pipeline menu
// (ui/Panel.tsx's `activeStage`/`onStageChange`). Terrain gets the existing
// full `NoisePanel` and Erosion its own; every remaining stage is still an
// empty placeholder until that stage's own feature gets built.
export function RightPanel({ width, activeStage, erosion, erosionPatch, chunkMeshResolution, ...props }: RightPanelProps) {
  return (
    <div className="panel-outer" style={{ width }}>
      <div className="panel-content">
        {activeStage === 'terrain' && <NoisePanel {...props} />}
        {activeStage === 'erosion' && (
          <ErosionPanel
            rates={erosion.rates}
            onRatesChange={erosion.updateRates}
            durationYears={erosion.durationYears}
            onDurationYearsChange={erosion.setDurationYears}
            gridResolution={erosion.gridResolution}
            onGridResolutionChange={erosion.setGridResolution}
            seaLevel={erosion.seaLevel}
            onSeaLevelChange={erosion.setSeaLevel}
            patch={erosionPatch}
            meshResolution={chunkMeshResolution}
            onRun={erosion.run}
            onClear={erosion.clear}
            result={erosion.result}
            isStale={erosion.isStale}
          />
        )}
        {activeStage !== 'terrain' && activeStage !== 'erosion' && (
          <StagePlaceholder label={PIPELINE_STAGES.find((stage) => stage.key === activeStage)!.label} />
        )}
      </div>
    </div>
  );
}
