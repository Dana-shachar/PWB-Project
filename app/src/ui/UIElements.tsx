import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

const TOOLTIP_MARGIN = 8;
const TOOLTIP_GAP = 6;
const WIDE_ANCHOR_WIDTH = 160;

// Places an anchor's tooltip above it (below if there's no room), centered
// for small anchors and left-aligned for row-shaped ones, clamped inside the
// window on every side. One shared rule for every .ui-tooltip.
function placeTooltip(anchor: HTMLElement): void {
  const tooltip = anchor.querySelector<HTMLElement>(':scope > .ui-tooltip') ?? anchor.querySelector<HTMLElement>('.ui-tooltip');
  if (!tooltip) return;
  const anchorRect = anchor.getBoundingClientRect();
  const tipRect = tooltip.getBoundingClientRect();
  const wide = anchorRect.width > WIDE_ANCHOR_WIDTH;
  const idealLeft = wide ? anchorRect.left : anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
  const left = Math.min(Math.max(TOOLTIP_MARGIN, idealLeft), window.innerWidth - tipRect.width - TOOLTIP_MARGIN);
  const above = anchorRect.top - tipRect.height - TOOLTIP_GAP;
  const top = above >= TOOLTIP_MARGIN ? above : Math.min(anchorRect.bottom + TOOLTIP_GAP, window.innerHeight - tipRect.height - TOOLTIP_MARGIN);
  tooltip.style.left = `${Math.max(TOOLTIP_MARGIN, left)}px`;
  tooltip.style.top = `${Math.max(TOOLTIP_MARGIN, top)}px`;
}

// One delegated listener for the whole app, so each tooltip needs no
// component of its own and none is patched per control.
if (typeof document !== 'undefined') {
  const handleTooltipTrigger = (event: Event) => {
    const target = event.target as Element | null;
    const anchor = target?.closest?.('.ui-tooltip-anchor');
    if (anchor instanceof HTMLElement) placeTooltip(anchor);
  };
  document.addEventListener('mouseover', handleTooltipTrigger);
  document.addEventListener('focusin', handleTooltipTrigger);
}

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
  disabled?: boolean; // e.g. a view-specific control while both viewport panes are selected, see ui/Panel.tsx
  // What the control does and what its number means, shown on hover. A label
  // and a number alone do not say what unit something is in or what moving it
  // will change (Dana, 2026-10-13: "the menu settings tell me nothing").
  description?: string;
  // Overrides the field's default 36px width — for a value that genuinely
  // needs more room, e.g. Erosion's Duration running to 7 digits, rather
  // than widening every slider's field to fit the rare long one.
  fieldWidth?: number;
  // 'log' maps the track logarithmically (min must be above 0), for controls
  // spanning orders of magnitude like noise frequency. The number field still
  // takes exact values.
  scale?: 'linear' | 'log';
  // Runs the track and the scrub backwards, so moving right means a smaller
  // number, for a control where lower is the stronger setting (a pixel error
  // threshold). The number field still shows and takes the real value.
  reversed?: boolean;
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
  disabled = false,
  description,
  fieldWidth,
  scale = 'linear',
  reversed = false,
}: SliderProps) {
  const fieldRef = useRef<HTMLInputElement>(null);
  const isLog = scale === 'log' && min > 0;
  const logSpan = Math.log(max / min);

  // The track runs 0..1 in log mode, mapped to and from the real value.
  // Reversed flips it, so the far right end is the minimum.
  function valueFromTrack(trackValue: number): number {
    const position = reversed ? (isLog ? 1 - trackValue : min + max - trackValue) : trackValue;
    if (!isLog) return position;
    const raw = min * Math.exp(position * logSpan);
    return Math.min(max, Math.max(min, Math.round(raw / step) * step));
  }
  const forwardPosition = isLog ? Math.log(Math.max(min, value) / min) / logSpan : value;
  const trackPosition = reversed ? (isLog ? 1 - forwardPosition : min + max - forwardPosition) : forwardPosition;

  function handleTrackChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(valueFromTrack(parseFloat(event.target.value)));
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
      // Log controls scrub by a proportion, so each pixel feels the same at any magnitude.
      const drag = reversed ? -moveEvent.movementX : moveEvent.movementX;
      currentValue = isLog ? currentValue * Math.exp(drag * sensitivity * 0.1) : currentValue + drag * sensitivity;
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
    <div className={'ui-slider-row ui-tooltip-anchor' + (disabled ? ' ui-slider-row--disabled' : '')}>
      {description && <span className="ui-tooltip">{description}</span>}
      <label className="ui-slider-label">
        {label}
        {unit ? ` (${unit})` : ''}
      </label>
      <input
        type="range"
        className={'ui-slider-track' + (trackClassName ? ` ${trackClassName}` : '')}
        min={isLog ? 0 : min}
        max={isLog ? 1 : max}
        step={isLog ? 0.001 : step}
        value={trackPosition}
        onChange={handleTrackChange}
        disabled={disabled}
      />
      <input
        ref={fieldRef}
        type="text"
        className="ui-slider-field"
        style={fieldWidth ? { flexBasis: fieldWidth } : undefined}
        defaultValue={value.toFixed(precision)}
        key={value} // resync the field's displayed text whenever value changes externally
        onMouseDown={handleScrubberMouseDown}
        onBlur={handleFieldCommit}
        onKeyDown={handleFieldKeyDown}
        disabled={disabled}
      />
    </div>
  );
}

interface DialProps {
  label: string;
  value: number; // degrees, 0 to 360
  onChange: (value: number) => void;
  disabled?: boolean;
  description?: string;
}

const DIAL_SNAP_DEGREES = 15; // Cmd/Ctrl while dragging, Shift with the arrow keys
const DIAL_SCRUB_SENSITIVITY = 1; // degrees per pixel dragged on the number field

// A round angle control (Dana, 2026-10-28): drag around the circle to point its line at an angle, with the same number
// field as the slider rows (drag to scrub, click to type). Photoshop's angle controls follow this convention.
export function Dial({ label, value, onChange, disabled = false, description }: DialProps) {
  const [dragging, setDragging] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  const wrap = (degrees: number) => ((Math.round(degrees) % 360) + 360) % 360;

  function angleFromPointer(event: { clientX: number; clientY: number }, element: HTMLElement): number {
    const box = element.getBoundingClientRect();
    // Screen y points down, so it is flipped: 0 degrees points right, angles turn counterclockwise.
    return (Math.atan2(box.top + box.height / 2 - event.clientY, event.clientX - (box.left + box.width / 2)) * 180) / Math.PI;
  }

  function handleDialPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return;
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    setDragging(true);
    const apply = (pointer: PointerEvent | React.PointerEvent) => {
      const angle = angleFromPointer(pointer, element);
      onChange(wrap(pointer.metaKey || pointer.ctrlKey ? Math.round(angle / DIAL_SNAP_DEGREES) * DIAL_SNAP_DEGREES : angle));
    };
    apply(event);
    const onMove = (moveEvent: PointerEvent) => apply(moveEvent);
    const onUp = () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      setDragging(false);
    };
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
  }

  function handleDialKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? DIAL_SNAP_DEGREES : 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') onChange(wrap(value + step));
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') onChange(wrap(value - step));
    else return;
    event.preventDefault();
  }

  function handleFieldCommit() {
    const field = fieldRef.current;
    if (!field) return;
    const parsed = parseFloat(field.value);
    if (!Number.isNaN(parsed)) onChange(wrap(parsed));
    else field.value = String(value);
  }

  // Click-drag to scrub, click-without-drag to focus for typing, as the slider rows' number field does.
  function handleFieldMouseDown(event: React.MouseEvent<HTMLInputElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    let hasMoved = false;
    let current = value;
    const onMove = (moveEvent: MouseEvent) => {
      hasMoved = true;
      current += moveEvent.movementX * DIAL_SCRUB_SENSITIVITY;
      onChange(wrap(moveEvent.metaKey || moveEvent.ctrlKey ? Math.round(current / DIAL_SNAP_DEGREES) * DIAL_SNAP_DEGREES : current));
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
    <div className={'ui-slider-row ui-tooltip-anchor' + (disabled ? ' ui-slider-row--disabled' : '')}>
      {description && <span className="ui-tooltip">{description}</span>}
      <label className="ui-slider-label">{label} (°)</label>
      <div className="ui-dial-track">
        <div
          className={'ui-dial' + (dragging ? ' ui-dial--active' : '')}
          role="slider"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={value}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onPointerDown={handleDialPointerDown}
          onKeyDown={handleDialKeyDown}
        >
          <span className="ui-dial-line" style={{ transform: `rotate(${-value}deg)` }} />
        </div>
      </div>
      <input
        ref={fieldRef}
        type="text"
        className="ui-slider-field"
        defaultValue={String(value)}
        key={value}
        onMouseDown={handleFieldMouseDown}
        onBlur={handleFieldCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { handleFieldCommit(); fieldRef.current?.blur(); }
          if (event.key === 'Escape') { if (fieldRef.current) fieldRef.current.value = String(value); fieldRef.current?.blur(); }
        }}
        disabled={disabled}
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
  description?: string; // shown on hover, same reason as Slider's
}

// A sliding pill switch, not a checkbox (Dana, 2026-10-14: a track with a
// knob that slides side to side, the standard iOS/Material toggle). A real
// <button> underneath (role="switch"), not a styled checkbox — the visual is
// entirely CSS, see .ui-toggle-button in design.css.
export function Toggle({ label, value, onChange, description }: ToggleProps) {
  return (
    <div className="ui-toggle-row ui-tooltip-anchor">
      {description && <span className="ui-tooltip">{description}</span>}
      <label className="ui-toggle-label">{label}</label>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        className={'ui-toggle-button' + (value ? ' ui-toggle-button--on' : '')}
        onClick={() => onChange(!value)}
      />
    </div>
  );
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  description?: string; // shown on hover, same reason as Slider's
}

// Plain <select>, styled to match the panel's other controls — the React
// equivalent of the gumball's vanilla-DOM view-preset dropdown.
export function Select({ label, value, onChange, options, description }: SelectProps) {
  return (
    <div className="ui-select-row ui-tooltip-anchor">
      {description && <span className="ui-tooltip">{description}</span>}
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
  // 'click' (default) for the project name — nothing else there competes
  // for a plain click. 'doubleClick' for layer names (ui/NoisePanel.tsx) —
  // a single click on a layer row already means "select it," so editing
  // needs its own, non-conflicting gesture (Dana, 2026-09-22's original
  // "double-click to edit inline" spec).
  activateOn?: 'click' | 'doubleClick';
}

// Click-to-edit inline text — plain text until activated, then a text
// field; Enter/blur commits, Escape cancels. Used for the current project's
// name (see ui/Panel.tsx) and layer names (ui/NoisePanel.tsx) — a shared
// component rather than one-off, per ROADMAP.md.
export function EditableText({ value, onCommit, className, activateOn = 'click' }: EditableTextProps) {
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

  const activateProps =
    activateOn === 'doubleClick' ? { onDoubleClick: () => setIsEditing(true) } : { onClick: () => setIsEditing(true) };

  return (
    <span className={className} {...activateProps}>
      {value}
    </span>
  );
}

interface AccordionProps {
  title: string;
  defaultOpen?: boolean;
  nested?: boolean; // lighter/smaller header + indented content, for an accordion inside another one (e.g. "My Projects" inside "Project Settings")
  // For an accordion that doubles as a pipeline stage ("Planet Terrain" in
  // ui/Panel.tsx): runs on every header click, and highlights it while active.
  onHeaderClick?: () => void;
  active?: boolean;
  // What the section is for, shown on hover like a Slider's description.
  description?: string;
  children: ReactNode;
}

// A collapsible section — same visual weight as a plain panel-section, just
// toggleable, for sections that don't need to stay visible all the time
// (Dana, 2026-09-22). `nested` styles it as a subordinate of its parent
// section rather than a peer category (Dana, 2026-09-23 — "Project Settings"
// and "My Projects" read as equal-weight siblings with no `nested` variant).
export function Accordion({ title, defaultOpen = false, nested = false, onHeaderClick, active = false, description, children }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className={'ui-accordion' + (nested ? ' ui-accordion--nested' : '')}>
      <button
        type="button"
        className={'ui-accordion-header' + (active ? ' ui-accordion-header--active' : '') + (description ? ' ui-tooltip-anchor ui-accordion-header--described' : '')}
        onClick={() => {
          setIsOpen(!isOpen);
          onHeaderClick?.();
        }}
      >
        <span>{title}</span>
        {description && <span className="ui-tooltip">{description}</span>}
        <span className={'ui-accordion-chevron' + (isOpen ? ' ui-accordion-chevron--open' : '')}>▾</span>
      </button>
      {isOpen && <div className="ui-accordion-content">{children}</div>}
    </div>
  );
}

interface IconButtonProps {
  icon: ReactNode;
  label: string; // the hover tooltip, and the accessible name
  onClick: () => void;
  disabled?: boolean;
}

// The text button's frame (.noise-add-layer-btn) around an icon alone, with
// a hover tooltip naming it (Dana, 2026-10-21). Added to the design system
// since it had no icon-only button.
export function IconButton({ icon, label, onClick, disabled = false }: IconButtonProps) {
  return (
    <button
      type="button"
      className="noise-add-layer-btn ui-icon-btn ui-tooltip-anchor"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {icon}
      <span className="ui-tooltip">{label}</span>
    </button>
  );
}

interface PopupProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>; // the trigger it hangs off
  onClose: () => void;
  children: ReactNode;
}

const POPUP_WIDTH = 260;
const POPUP_MARGIN = 8;

// A small floating panel under its trigger, right-aligned to it and kept
// inside the window. Closes on an outside click or Escape. Drawn through a
// portal so the side panel's scrolling can't clip it. Added to the design
// system for the layer mask controls (Dana, 2026-10-21).
export function Popup({ open, anchorRef, onClose, children }: PopupProps) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!open || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const left = Math.min(Math.max(POPUP_MARGIN, rect.right - POPUP_WIDTH), window.innerWidth - POPUP_WIDTH - POPUP_MARGIN);
    setPosition({ left, top: rect.bottom + 6 });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (popupRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, anchorRef, onClose]);

  if (!open) return null;
  return createPortal(
    // Portal events still bubble through React ancestors, so stop them here (a layer row would start a drag).
    <div
      ref={popupRef}
      className="ui-popup"
      style={{ left: position.left, top: position.top, width: POPUP_WIDTH }}
      role="dialog"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
