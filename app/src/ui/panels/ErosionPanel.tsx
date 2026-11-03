import { Accordion, ProgressBar, Slider } from '../UIElements';
import type { WaterProgress } from '../../rivers/drainageControls';
import { MAX_DURATION_YEARS, type ErosionResult } from '../../erosion/erosionControls';
import { formatYears } from '../../erosion/erosionEngine';
import type { ErosionFilterShape } from '../../map/heightmap';

interface ErosionPanelProps {
  // One set of erosion settings, shared by the planet (rivers/planetDrainage.ts) and the land chunk (erosion/).
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  durationYears: number;
  onDurationYearsChange: (value: number) => void;
  strength: number;
  onStrengthChange: (value: number) => void;
  // The gullies' look on the planet's surface (heightmap.frag.glsl, erodedSurface); re-bakes only, no drainage rerun.
  filterShape: ErosionFilterShape;
  onFilterShapeChange: (changed: Partial<ErosionFilterShape>) => void;
  waterProgress: WaterProgress | null;
  // How finely the chunk is drawn, which caps how much of a run can be seen
  // however finely it was computed.
  meshResolution: number | null;
  result: ErosionResult | null;
}

// Erosion lives in the Climate System's right panel with no Run button: a change reruns only what it affects. Sea
// level comes from Ocean, rain from Climate; the engines' other rates keep their tuned defaults (Dana, 2026-11-03).
export function ErosionPanel({ enabled, onEnabledChange, durationYears, onDurationYearsChange, strength, onStrengthChange, filterShape, onFilterShapeChange, waterProgress, meshResolution, result }: ErosionPanelProps) {
  // A run computed far finer than the chunk is drawn is real but mostly
  // invisible, which is indistinguishable from a run that did nothing. Say
  // so rather than letting it read as a failure.
  const outrunsMesh = result !== null && meshResolution !== null && meshResolution < result.outcome.gridResolution / 2;

  return (
    <div className="panel-section">
      <Accordion title="Erosion" headerSwitch={{ value: enabled, onChange: onEnabledChange, label: 'Erosion on or off' }}>
        <Slider
          label="Duration"
          unit="years"
          value={durationYears}
          onChange={(value) => onDurationYearsChange(Math.round(value))}
          min={1000}
          max={MAX_DURATION_YEARS}
          step={1000}
          precision={0}
          sensitivity={2000}
          snapIncrement={10000}
          description="How long rivers and rain have been carving the land, on the planet and in the land chunk. Longer cuts deeper valleys."
          fieldWidth={56}
          disabled={!enabled}
        />
        <Slider
          label="Strength"
          value={strength}
          onChange={onStrengthChange}
          min={0}
          max={3}
          step={0.01}
          precision={2}
          sensitivity={0.01}
          snapIncrement={0.1}
          disabled={!enabled}
          description="How easily the rock wears away: 1 is the tuned default, 0 is rock that never erodes, higher is softer ground that carves faster."
        />
        {waterProgress !== null && <ProgressBar label={waterProgress.label} share={waterProgress.share} secondsLeft={waterProgress.secondsLeft} />}
        <div className="panel-section-divider" />
        <span className="panel-section-title">Shape</span>
        <Slider
          label="Gully Size"
          value={filterShape.size}
          onChange={(size) => onFilterShapeChange({ size })}
          min={0.25}
          max={4}
          step={0.05}
          precision={2}
          disabled={!enabled}
          description="How wide the gullies and ridges are, as a multiple of the size measured from the land's valleys. 1 is the measured size."
        />
        <Slider
          label="Gully Depth"
          value={filterShape.depth}
          onChange={(depth) => onFilterShapeChange({ depth })}
          min={0}
          max={0.5}
          step={0.01}
          precision={2}
          disabled={!enabled}
          description="How deep the gullies cut. Higher values also bend them more, so past about 0.4 they start to look chaotic."
        />
        <Slider
          label="Ridge Sharpness"
          value={filterShape.weight}
          onChange={(weight) => onFilterShapeChange({ weight })}
          min={0}
          max={1}
          step={0.01}
          precision={2}
          disabled={!enabled}
          description="0 keeps sharp peaks and valleys with almost no gullies; 1 gives full gullies but softer peaks."
        />
        <Slider
          label="Detail"
          value={filterShape.detail}
          onChange={(detail) => onFilterShapeChange({ detail })}
          min={0.5}
          max={3}
          step={0.05}
          precision={2}
          disabled={!enabled}
          description="How far the smaller gullies spread. Lower keeps them to the steepest slopes; higher covers more of the land."
        />

        {/* What the last run actually did. Without a measurement there is no
            way to tell a run that changed nothing from one that changed
            something too small to see at this mesh resolution. */}
        {result && (
          <div className="erosion-readout">
            <div className="erosion-readout-row">
              <span>Simulated</span>
              <span>{formatYears(result.outcome.years)}</span>
            </div>
            <div className="erosion-readout-row">
              <span>Steps</span>
              <span>
                {result.outcome.steps.toLocaleString()} at {result.outcome.gridResolution}²
              </span>
            </div>
            <div className="erosion-readout-row">
              <span>Average change</span>
              <span>{result.outcome.meanChange.toFixed(4)}</span>
            </div>
            <div className="erosion-readout-row">
              <span>Largest change</span>
              <span>{result.outcome.maxChange.toFixed(4)}</span>
            </div>
            <div className="erosion-readout-row">
              <span>Took</span>
              <span>{Math.round(result.outcome.elapsedMs).toLocaleString()} ms</span>
            </div>
          </div>
        )}

        {result && result.outcome.maxChange === 0 && (
          <p className="erosion-note">Nothing moved. Raise Rainfall in Climate, or Strength or Duration here.</p>
        )}
        {outrunsMesh && (
          <p className="erosion-note">
            Computed at {result.outcome.gridResolution}² but drawn at {meshResolution}². Raise the chunk's Resolution to see
            the detail.
          </p>
        )}
        {!result && (
          <p className="erosion-note">
            Erosion runs on the piece the land chunk is showing. Double-click the planet to choose it.
          </p>
        )}
      </Accordion>
    </div>
  );
}
