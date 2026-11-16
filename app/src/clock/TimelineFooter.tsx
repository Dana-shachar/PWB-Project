import { Select } from '../ui/UIElements';
import { PauseIcon, PlayIcon, StopIcon, TimeZoomInIcon, TimeZoomOutIcon } from '../ui/icons';
import type { TimelineUnit } from './timeRuler';

const UNIT_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'years', label: 'Years' },
  { value: 'thousand', label: 'Thousand years' },
  { value: 'million', label: 'Million years' },
];

interface TimelineFooterProps {
  readoutYear: number;
  readoutTotal: string; // e.g. "/ 4,966 years"
  status?: string; // a run in progress, e.g. "Growing life, about 4 s left"
  onReadoutCommit: (year: number) => void;
  playing: boolean;
  transportDisabled: boolean;
  transportNote?: string; // why the transport is off, shown as its tooltip
  onPlayPause: () => void;
  onStop: () => void;
  unit: TimelineUnit;
  onUnitChange: (unit: TimelineUnit) => void;
  zoomLevel: number; // 0 the whole span, 1 the closest zoom
  onZoomTo: (level: number) => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  disabled?: boolean; // nothing to show yet
}

// The bottom row both timelines share: the exact year on the left, the transport in the middle, and the unit and
// After Effects' time zoom (small mountain, slider, large mountain) on the right.
export function TimelineFooter(props: TimelineFooterProps) {
  const { disabled = false, transportDisabled } = props;
  const transportOff = disabled || transportDisabled;
  const transportTip = (label: string) => (transportOff && props.transportNote ? props.transportNote : label);

  return (
    <div className="timeline-footer">
      <div className="erosion-timeline-readout">
        <input
          type="text"
          className="ui-slider-field"
          defaultValue={Math.round(props.readoutYear).toLocaleString()}
          key={props.readoutYear}
          disabled={disabled}
          onBlur={(event) => {
            const parsed = parseFloat(event.currentTarget.value.replace(/,/g, ''));
            if (!Number.isNaN(parsed)) props.onReadoutCommit(parsed);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <span className="erosion-timeline-readout-label">{props.readoutTotal}</span>
        {props.status && <span className="timeline-status" role="status">{props.status}</span>}
      </div>

      <div className="timeline-transport">
        <button type="button" className="erosion-timeline-transport-btn timeline-transport-btn ui-tooltip-anchor" aria-disabled={transportOff} onClick={() => !transportOff && props.onStop()}>
          <StopIcon />
          <span className="ui-tooltip">{transportTip('Stop')}</span>
        </button>
        <button type="button" className="erosion-timeline-transport-btn timeline-transport-btn ui-tooltip-anchor" aria-disabled={transportOff} onClick={() => !transportOff && props.onPlayPause()}>
          {props.playing ? <PauseIcon /> : <PlayIcon />}
          <span className="ui-tooltip">{transportTip(props.playing ? 'Pause' : 'Play')}</span>
        </button>
      </div>

      <div className="timeline-view-controls">
        <Select inline label="Unit" value={props.unit} onChange={(value) => props.onUnitChange(value as TimelineUnit)} options={UNIT_OPTIONS} disabled={disabled} />
        <div className="timeline-zoom">
          <button type="button" className="erosion-timeline-zoom-btn ui-tooltip-anchor" onClick={props.onZoomOut} disabled={disabled}>
            <TimeZoomOutIcon />
            <span className="ui-tooltip">Zoom out</span>
          </button>
          <input
            type="range"
            className="ui-slider-track timeline-zoom-slider"
            aria-label="Time zoom"
            min={0}
            max={1}
            step={0.001}
            value={props.zoomLevel}
            disabled={disabled}
            onChange={(event) => props.onZoomTo(Number(event.target.value))}
          />
          <button type="button" className="erosion-timeline-zoom-btn ui-tooltip-anchor" onClick={props.onZoomIn} disabled={disabled}>
            <TimeZoomInIcon />
            <span className="ui-tooltip">Zoom in</span>
          </button>
        </div>
      </div>
    </div>
  );
}
