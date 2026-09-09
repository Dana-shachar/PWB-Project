import { useRef } from 'react';

interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string; // e.g. "km" — shown next to the label
  precision?: number; // decimal places shown in the number field, default 2
  // Scrubber tuning (click-drag on the number field to change the value),
  // ported from active-geometry-project's makeScrubber:
  sensitivity?: number; // value change per pixel dragged, default 0.1
  snapIncrement?: number; // value snapped to when Cmd/Ctrl is held, default 1
}

// Blended slider: a visible draggable range track (from active-geometry's
// addSlider) plus a number field that can be typed into directly or
// click-dragged to scrub the value up/down (from active-geometry's
// numInput/makeScrubber). Both stay in sync with the same value/onChange.
export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  precision = 2,
  sensitivity = 0.1,
  snapIncrement = 1,
}: SliderProps) {
  const fieldRef = useRef<HTMLInputElement>(null);

  function handleTrackChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(parseFloat(event.target.value));
  }

  function handleFieldCommit() {
    const field = fieldRef.current;
    if (!field) return;
    const parsed = parseFloat(field.value);
    if (!Number.isNaN(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    } else {
      field.value = value.toFixed(precision);
    }
  }

  function handleFieldKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      handleFieldCommit();
      fieldRef.current?.blur();
    }
    if (event.key === 'Escape') {
      if (fieldRef.current) fieldRef.current.value = value.toFixed(precision);
      fieldRef.current?.blur();
    }
  }

  // Click-drag to scrub, click-without-drag to focus for typing —
  // ported from active-geometry-project's makeScrubber.
  function handleScrubberMouseDown(event: React.MouseEvent<HTMLInputElement>) {
    if (event.button !== 0) return;
    event.preventDefault();

    let hasMoved = false;
    let currentValue = value;

    const onMove = (moveEvent: MouseEvent) => {
      hasMoved = true;
      currentValue = currentValue + moveEvent.movementX * sensitivity;
      if (moveEvent.metaKey || moveEvent.ctrlKey) {
        currentValue = Math.round(currentValue / snapIncrement) * snapIncrement;
      }
      currentValue = Math.min(max, Math.max(min, currentValue));
      onChange(currentValue);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!hasMoved) {
        fieldRef.current?.focus();
        fieldRef.current?.select();
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div className="ui-slider-row">
      <label className="ui-slider-label">
        {label}
        {unit ? ` (${unit})` : ''}
      </label>
      <input
        type="range"
        className="ui-slider-track"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleTrackChange}
      />
      <input
        ref={fieldRef}
        type="text"
        className="ui-slider-field"
        defaultValue={value.toFixed(precision)}
        key={value} // resync the field's displayed text whenever value changes externally
        onMouseDown={handleScrubberMouseDown}
        onBlur={handleFieldCommit}
        onKeyDown={handleFieldKeyDown}
      />
    </div>
  );
}

interface ColorPickerProps {
  label: string;
  value: string; // hex string, e.g. "#3a7bd5"
  onChange: (value: string) => void;
}

// Not ported from active-geometry — it has no color-picker convention.
// Plain native <input type="color">, styled to match the rest of the panel.
export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  return (
    <div className="ui-color-row">
      <label className="ui-color-label">{label}</label>
      <input
        type="color"
        className="ui-color-swatch"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
