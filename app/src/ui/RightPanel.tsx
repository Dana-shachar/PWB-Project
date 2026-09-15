import { useState } from 'react';
import { NoisePanel } from './NoisePanel';
import type { NoiseType } from '../map/heightmap';

// One tab per technique — see Dana's 2026-09-14 decision: tabs organized by
// technique/effect, not by the planet's parts, since these operations all
// compose onto one shared heightmap+texture rather than being independent
// domains. Paint/Erosion/Color are empty placeholders (ROADMAP.md items
// 7-9) — real content lands in each when that feature actually gets built.
type RightPanelTab = 'noise' | 'paint' | 'erosion' | 'color';

const TABS: { key: RightPanelTab; label: string }[] = [
  { key: 'noise', label: 'Noise' },
  { key: 'paint', label: 'Paint' },
  { key: 'erosion', label: 'Erosion' },
  { key: 'color', label: 'Color' },
];

interface RightPanelProps {
  noiseType: NoiseType;
  onNoiseTypeChange: (value: NoiseType) => void;
  noiseSeed: number;
  onNoiseSeedChange: (value: number) => void;
  noiseFrequency: number;
  onNoiseFrequencyChange: (value: number) => void;
  noiseOctaves: number;
  onNoiseOctavesChange: (value: number) => void;
  noisePersistence: number;
  onNoisePersistenceChange: (value: number) => void;
  noiseLacunarity: number;
  onNoiseLacunarityChange: (value: number) => void;
  noiseTerraceSteps: number;
  onNoiseTerraceStepsChange: (value: number) => void;
}

// Right-side panel — a tab bar (ported from active-geometry's
// buildStageTabs/.ag-stage-tab convention) above the panel content, so more
// technique tabs (Paint, Erosion, ...) can be added later without
// restructuring. Only 'noise' exists for now, so the tab bar always shows a
// single active tab — it still switches via React state, not hardcoded,
// so adding a second tab is just adding an entry to TABS.
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
