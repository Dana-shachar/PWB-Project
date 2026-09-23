import { useState, type RefObject } from 'react';
import { NoisePanel } from './NoisePanel';
import type { NoiseLayer, StrokeRecord } from '../map/heightmap';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';

// One tab per technique — see Dana's 2026-09-14 decision: tabs organized by
// technique/effect, not by the planet's parts, since these operations all
// compose onto one shared heightmap+texture rather than being independent
// domains. Erosion/Color are empty placeholders (ROADMAP.md items 8-9) —
// real content lands in each when that feature actually gets built. Paint
// isn't its own tab (2026-09-15 decision) — it's a brush tool that targets
// whichever layer is selected in the Noise tab, since it generates
// displacement the same way procedural noise does.
type RightPanelTab = 'noise' | 'erosion' | 'color';

const TABS: { key: RightPanelTab; label: string }[] = [
  { key: 'noise', label: 'Noise' },
  { key: 'erosion', label: 'Erosion' },
  { key: 'color', label: 'Color' },
];

interface RightPanelProps {
  layers: NoiseLayer[];
  selectedLayerId: string;
  onSelectLayer: (id: string) => void;
  onAddLayer: () => void;
  onDeleteLayer: (id: string) => void;
  onReorderLayer: (draggedId: string, targetId: string) => void;
  onUpdateSelectedLayer: (patch: Partial<NoiseLayer>) => void;
  brushRadiusPx: number;
  onBrushRadiusPxChange: (value: number) => void;
  brushValue: number;
  onBrushValueChange: (value: number) => void;
  feather: number;
  onFeatherChange: (value: number) => void;
  sceneHandleRef: RefObject<SceneCanvasHandle | null>;
  onStrokeComplete: (record: StrokeRecord) => void;
  paintVersion: number;
}

// Right-side panel — a tab bar (ported from active-geometry's
// buildStageTabs/.ag-stage-tab convention) above the panel content, so more
// technique tabs (Erosion, Color, ...) can be added later without
// restructuring.
export function RightPanel(props: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<RightPanelTab>('noise');

  return (
    <div className="panel-outer">
      <div className="right-panel-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={'right-panel-tab' + (activeTab === tab.key ? ' right-panel-tab--active' : '')}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="panel-content">{activeTab === 'noise' && <NoisePanel {...props} />}</div>
    </div>
  );
}
