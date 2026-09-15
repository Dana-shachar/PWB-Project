import { Slider, ColorPicker, Toggle, Select } from './UIElements';

const DISPLAY_MODE_OPTIONS = [
  { value: 'shaded', label: 'Shaded' },
  { value: 'wireframe', label: 'Wireframe' },
];
import { MapView } from '../map/MapView';

interface PanelProps {
  // Scene controls
  ambientLight: number;
  onAmbientLightChange: (value: number) => void;
  lightDirX: number;
  onLightDirXChange: (value: number) => void;
  lightDirY: number;
  onLightDirYChange: (value: number) => void;
  gridSpacing: number;
  onGridSpacingChange: (value: number) => void;
  gridVisible: boolean;
  onGridVisibleChange: (value: boolean) => void;
  // Planet controls
  radiusKm: number;
  onRadiusKmChange: (value: number) => void;
  baseColor: string;
  onBaseColorChange: (value: string) => void;
  displayMode: string; // 'shaded' | 'wireframe'
  onDisplayModeChange: (value: string) => void;
  // Noise (temporary placement — the real "add noise layer" / left-right
  // panel layer system is a later step; this proves the pipeline for now)
  noiseSeed: number;
  onNoiseSeedChange: (value: number) => void;
  noiseFrequency: number;
  onNoiseFrequencyChange: (value: number) => void;
}

// Left-side control panel, divided into titled sections — ported from
// active-geometry-project's right-panel pattern (section() + ag-panel-section:
// a bold titled group, sections separated by a divider), mirrored to the left
// per this project's layout. Lighting slider ranges are also ported directly
// (ambient 0-0.5/step 0.01, light X/Y -10-10/step 0.1) — the two things NOT
// borrowed (no convention exists for them in active-geometry) are the color
// picker and the grid-spacing range, both flagged where they're defined.
export function Panel({
  ambientLight,
  onAmbientLightChange,
  lightDirX,
  onLightDirXChange,
  lightDirY,
  onLightDirYChange,
  gridSpacing,
  onGridSpacingChange,
  gridVisible,
  onGridVisibleChange,
  radiusKm,
  onRadiusKmChange,
  baseColor,
  onBaseColorChange,
  displayMode,
  onDisplayModeChange,
  noiseSeed,
  onNoiseSeedChange,
  noiseFrequency,
  onNoiseFrequencyChange,
}: PanelProps) {
  return (
    <div className="panel-outer">
      <div className="panel-content">
        <div className="panel-section">
          <div className="panel-section-title">Scene controls</div>
          <Slider
            label="Ambient light"
            value={ambientLight}
            onChange={onAmbientLightChange}
            min={0}
            max={0.5}
            step={0.01}
          />
          <Slider
            label="X pos light"
            value={lightDirX}
            onChange={onLightDirXChange}
            min={-10}
            max={10}
            step={0.1}
          />
          <Slider
            label="Y pos light"
            value={lightDirY}
            onChange={onLightDirYChange}
            min={-10}
            max={10}
            step={0.1}
          />
          {/* TODO(DS): grid spacing range not borrowed from active-geometry — it has no shader-plane grid */}
          <Slider
            label="Grid spacing"
            value={gridSpacing}
            onChange={onGridSpacingChange}
            min={1}
            max={50}
            step={1}
            precision={0}
          />
          <Toggle label="Grid lines" value={gridVisible} onChange={onGridVisibleChange} />
        </div>

        <div className="panel-section-divider" />

        <div className="panel-section">
          <div className="panel-section-title">Planet controls</div>
          <Select
            label="Display"
            value={displayMode}
            onChange={onDisplayModeChange}
            options={DISPLAY_MODE_OPTIONS}
          />
          <Slider
            label="Radius"
            unit="km"
            value={radiusKm}
            onChange={onRadiusKmChange}
            min={1000}
            max={15000}
            step={100}
            precision={0}
          />
          <ColorPicker label="Base color" value={baseColor} onChange={onBaseColorChange} />
        </div>

        <div className="panel-section-divider" />

        <div className="panel-section">
          {/* Temporary section — becomes the "add noise layer" left/right
              layer system in a later step. Only Perlin is wired up so far;
              noise.glsl already has Random/Simplex/Voronoi/Ridged ready for
              when the type dropdown is added. */}
          <div className="panel-section-title">Noise (Perlin, temporary UI)</div>
          <Slider
            label="Seed"
            value={noiseSeed}
            onChange={onNoiseSeedChange}
            min={0}
            max={1000}
            step={1}
            precision={0}
          />
          <Slider
            label="Frequency"
            value={noiseFrequency}
            onChange={onNoiseFrequencyChange}
            min={0.5}
            max={20}
            step={0.1}
          />
          <MapView seed={noiseSeed} frequency={noiseFrequency} />
        </div>
      </div>
    </div>
  );
}
