import { Slider } from '../UIElements';
import { MAX_DURATION_YEARS, type ErosionResult } from '../../erosion/erosionControls';
import { formatYears, type ErosionRates } from '../../erosion/erosionEngine';
import { MAX_PATCH_SAMPLES, type TerrainPatch } from '../../planet/patch';

interface ErosionPanelProps {
  rates: ErosionRates;
  onRatesChange: (changed: Partial<ErosionRates>) => void;
  durationYears: number;
  onDurationYearsChange: (value: number) => void;
  gridResolution: number;
  onGridResolutionChange: (value: number) => void;
  seaLevel: number;
  onSeaLevelChange: (value: number) => void;
  // Which piece of ground to erode. Comes from the land chunk, since that is
  // where the piece is chosen.
  patch: TerrainPatch;
  // How finely the chunk is drawn, which caps how much of a run can be seen
  // however finely it was computed.
  meshResolution: number | null;
  onRun: (patch: TerrainPatch) => void;
  onClear: () => void;
  result: ErosionResult | null;
  isStale: boolean;
}

// The Erosion stage's controls. Water and sediment are separate named rates
// rather than one strength slider, which is the point of the stage: the
// parameters are real, not a preset behind a single number. Names follow
// Houdini's HeightField Erode (see REFERENCES.md).
//
// Run is manual. Erosion is hundreds of simulation steps, so recomputing it
// live on every slider drag would make the stage unusable.
export function ErosionPanel({
  rates,
  onRatesChange,
  durationYears,
  onDurationYearsChange,
  gridResolution,
  onGridResolutionChange,
  seaLevel,
  onSeaLevelChange,
  patch,
  meshResolution,
  onRun,
  onClear,
  result,
  isStale,
}: ErosionPanelProps) {
  // A run computed far finer than the chunk is drawn is real but mostly
  // invisible, which is indistinguishable from a run that did nothing. Say
  // so rather than letting it read as a failure.
  const outrunsMesh = result !== null && meshResolution !== null && meshResolution < result.outcome.gridResolution / 2;

  return (
    <div className="panel-section">
      <div className="panel-section-title">Erosion</div>

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
        description="How long this run covers in the world’s own time. Converted into simulation steps at 500 years per step, so 100,000 years is 200 steps."
        fieldWidth={56}
      />
      <Slider
        label="Sea Level"
        value={seaLevel}
        onChange={onSeaLevelChange}
        min={-1}
        max={1}
        step={0.01}
        sensitivity={0.01}
        snapIncrement={0.1}
        description="Where the sea sits, in the same height units the terrain uses, centered on 0. Ground below it starts underwater: deep water barely erodes, so sediment gathers along the coast instead of washing away."
      />
      <Slider
        label="Rainfall"
        value={rates.rainfall}
        onChange={(value) => onRatesChange({ rainfall: value })}
        min={0}
        max={0.2}
        step={0.001}
        precision={3}
        sensitivity={0.001}
        snapIncrement={0.01}
        description="How much water falls on each cell per step. The engine’s water supply: raise it for wetter, faster-cutting terrain."
      />
      <Slider
        label="Evaporation Rate"
        value={rates.evaporationRate}
        onChange={(value) => onRatesChange({ evaporationRate: value })}
        min={0}
        max={0.1}
        step={0.001}
        precision={3}
        sensitivity={0.001}
        snapIncrement={0.01}
        description="How fast standing water disappears. Higher values end a run sooner and leave sediment where it was dropped."
      />
      <Slider
        label="Erosion Rate"
        value={rates.erosionRate}
        onChange={(value) => onRatesChange({ erosionRate: value })}
        min={0}
        max={5}
        step={0.01}
        sensitivity={0.02}
        snapIncrement={0.1}
        description="How fast moving water lifts rock into itself. This is the one that cuts valleys. Raise it to carve harder."
      />
      <Slider
        label="Deposition Rate"
        value={rates.depositionRate}
        onChange={(value) => onRatesChange({ depositionRate: value })}
        min={0}
        max={5}
        step={0.01}
        sensitivity={0.02}
        snapIncrement={0.1}
        description="How fast carried sediment settles back out. Higher values build up flats and river mouths rather than carrying material off."
      />
      <Slider
        label="Sediment Capacity"
        value={rates.sedimentCapacity}
        onChange={(value) => onRatesChange({ sedimentCapacity: value })}
        min={0}
        max={10}
        step={0.05}
        sensitivity={0.05}
        snapIncrement={0.5}
        description="How much rock the water can hold, per unit of slope and speed. Above this the water drops its load, below it picks more up."
      />
      <Slider
        label="Grid Resolution"
        value={gridResolution}
        onChange={(value) => onGridResolutionChange(Math.round(value))}
        min={33}
        max={MAX_PATCH_SAMPLES}
        step={32}
        precision={0}
        sensitivity={2}
        snapIncrement={64}
        description="How finely the physics is computed, in cells per side. Separate from the chunk’s own Resolution, which is only how finely it is drawn."
      />

      <div className="panel-btn-row">
        <button type="button" className="noise-add-layer-btn" onClick={() => onRun(patch)}>
          Run
        </button>
        <button type="button" className="noise-add-layer-btn" onClick={onClear} disabled={result === null}>
          Reset
        </button>
      </div>

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
        <p className="erosion-note">Nothing moved. Raise Rainfall or Erosion Rate, or lengthen the duration.</p>
      )}
      {outrunsMesh && (
        <p className="erosion-note">
          Computed at {result.outcome.gridResolution}² but drawn at {meshResolution}². Raise the chunk's Resolution to see
          the detail.
        </p>
      )}
      {isStale && <p className="erosion-note">The terrain changed since this run. Run again to match it.</p>}
      {!result && (
        <p className="erosion-note">
          Erosion runs on the piece the land chunk is showing. Double-click the planet to choose it.
        </p>
      )}
    </div>
  );
}
