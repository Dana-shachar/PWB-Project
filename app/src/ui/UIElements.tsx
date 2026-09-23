import { useRef, useState, type ReactNode } from 'react';

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
  trackClassName?: string; // extra class on the range track, e.g. for a custom gradient
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
  trackClassName,
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
        className={'ui-slider-track' + (trackClassName ? ` ${trackClassName}` : '')}
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

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

// Native checkbox, accent-colored — matches active-geometry's own checkbox
// convention (js/uiDesign.js's `checkbox()` helper), not a custom pill/switch.
export function Toggle({ label, value, onChange }: ToggleProps) {
  return (
    <div className="ui-toggle-row">
      <label className="ui-toggle-label">{label}</label>
      <input
        type="checkbox"
        className="ui-toggle-checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

// Plain <select>, styled to match the panel's other controls — the React
// equivalent of the gumball's vanilla-DOM view-preset dropdown.
export function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <div className="ui-select-row">
      <label className="ui-select-label">{label}</label>
      <select className="ui-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface EditableTextProps {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
}

// Click-to-edit inline text — plain text until clicked, then a text field;
// Enter/blur commits, Escape cancels. Used for the current project's name
// (see ui/Panel.tsx) — same interaction wanted later for layer names, per
// ROADMAP.md, so it's a shared component rather than one-off.
export function EditableText({ value, onCommit, className }: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);

  function commit() {
    setIsEditing(false);
    const trimmed = fieldRef.current?.value.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') fieldRef.current?.blur();
    if (event.key === 'Escape') {
      if (fieldRef.current) fieldRef.current.value = value;
      fieldRef.current?.blur();
    }
  }

  if (isEditing) {
    return (
      <input
        ref={fieldRef}
        type="text"
        className={className ? `${className}-input` : undefined}
        defaultValue={value}
        autoFocus
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <span className={className} onClick={() => setIsEditing(true)}>
      {value}
    </span>
  );
}

interface AccordionProps {
  title: string;
  defaultOpen?: boolean;
  nested?: boolean; // lighter/smaller header + indented content, for an accordion inside another one (e.g. "My Projects" inside "Project Settings")
  children: ReactNode;
}

// A collapsible section — same visual weight as a plain panel-section, just
// toggleable, for sections that don't need to stay visible all the time
// (Dana, 2026-09-22). `nested` styles it as a subordinate of its parent
// section rather than a peer category (Dana, 2026-09-23 — "Project Settings"
// and "My Projects" read as equal-weight siblings with no `nested` variant).
export function Accordion({ title, defaultOpen = true, nested = false, children }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className={'ui-accordion' + (nested ? ' ui-accordion--nested' : '')}>
      <button type="button" className="ui-accordion-header" onClick={() => setIsOpen(!isOpen)}>
        <span>{title}</span>
        <span className={'ui-accordion-chevron' + (isOpen ? ' ui-accordion-chevron--open' : '')}>▾</span>
      </button>
      {isOpen && <div className="ui-accordion-content">{children}</div>}
    </div>
  );
}
