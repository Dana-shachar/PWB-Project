import { Slider, Select } from './UIElements';
import { MapView } from '../map/MapView';
import { NOISE_TYPE_OPTIONS, type NoiseType } from '../map/heightmap';

interface NoisePanelProps {
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

// Content for the right panel's "Noise" tab (see RightPanel.tsx for the tab
// bar itself) — basic structural skeleton for the noise system, per Dana's
// request (2026-09-14) to see the layering concept early rather than keep
// extending the old temporary left-panel section. The layer list below is
// visual only for now: one fixed row, "+ Add layer" doesn't yet add a real
// second layer — actual multi-layer stacking/blending is a later step.
export function NoisePanel({
  noiseType,
  onNoiseTypeChange,
  noiseSeed,
  onNoiseSeedChange,
  noiseFrequency,
  onNoiseFrequencyChange,
  noiseOctaves,
  onNoiseOctavesChange,
  noisePersistence,
  onNoisePersistenceChange,
  noiseLacunarity,
  onNoiseLacunarityChange,
  noiseTerraceSteps,
  onNoiseTerraceStepsChange,
}: NoisePanelProps) {
  return (
    <>
      <div className="panel-section">
        <div className="panel-section-title">Layers</div>
        {/* TODO(DS): skeleton only — a single fixed row, no real layer array yet */}
        <div className="noise-layer-row">Layer 1</div>
        <button type="button" className="noise-add-layer-btn">
          + Add layer
        </button>
      </div>

      <div className="panel-section-divider" />

      <div className="panel-section">
        <div className="panel-section-title">Noise</div>
        <Select
          label="Noise type"
          value={noiseType}
          onChange={(value) => onNoiseTypeChange(value as NoiseType)}
          options={NOISE_TYPE_OPTIONS}
        />
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
      </div>

      {(noiseType === 'octaves' || noiseType === 'terrace') && (
        <>
          <div className="panel-section-divider" />
          <div className="panel-section">
            <div className="panel-section-title">Modifiers</div>
            {noiseType === 'octaves' && (
              <>
                <Slider
                  label="Octaves"
                  value={noiseOctaves}
                  onChange={onNoiseOctavesChange}
                  min={1}
                  max={8}
                  step={1}
                  precision={0}
                />
                <Slider
                  label="Persistence"
                  value={noisePersistence}
                  onChange={onNoisePersistenceChange}
                  min={0}
                  max={1}
                  step={0.05}
                />
                <Slider
                  label="Lacunarity"
                  value={noiseLacunarity}
                  onChange={onNoiseLacunarityChange}
                  min={1}
                  max={4}
                  step={0.1}
                />
              </>
            )}
            {noiseType === 'terrace' && (
              <Slider
                label="Terrace steps"
                value={noiseTerraceSteps}
                onChange={onNoiseTerraceStepsChange}
                min={2}
                max={20}
                step={1}
                precision={0}
              />
            )}
          </div>
        </>
      )}

      <div className="panel-section-divider" />

      <div className="panel-section">
        <div className="panel-section-title">2D preview</div>
        <MapView
          seed={noiseSeed}
          frequency={noiseFrequency}
          noiseType={noiseType}
          octaves={noiseOctaves}
          persistence={noisePersistence}
          lacunarity={noiseLacunarity}
          terraceSteps={noiseTerraceSteps}
        />
      </div>
    </>
  );
}
