import { useEffect, useRef, useState } from 'react';
import { ColorPicker, Select } from '../UIElements';
import { CloseIcon } from '../icons';
import { MAX_COLOR_STOPS, type ColorStop } from '../../planet/colorRamp';

interface ColorRampEditorProps {
  baseColor: string;
  onBaseColorChange: (value: string) => void;
  stops: ColorStop[];
  onStopsChange: (stops: ColorStop[]) => void;
  // Whether "Color by elevation" is on — when it's off, the ramp doesn't
  // apply at all, so only the plain base color makes sense to show (Dana,
  // 2026-10-21: "when ramp is nt active its ok to show only base color.
  // when ramp is active all colors should show as a part of it").
  rampActive: boolean;
  // The terrain's real (dimensionless) elevation range the ramp spans, and
  // how many meters one unit of it displaces by (Height % of radius/size).
  elevationRange: { min: number; max: number };
  elevationScaleMeters: number;
  // The position column's header, for a ramp that isn't by elevation (the water's ramp is by depth).
  positionLabel?: string;
  // A non-linear ramp's own position-to-meters mapping (the water ramp is spaced by light remaining); linear by default.
  positionToMeters?: (position: number) => number;
  metersToPosition?: (meters: number) => number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// A ramp position (0-1) back to the raw elevation it colors, the same
// linear map the shaders use (elevationFraction in shaders/fragment.glsl).
function rawElevationAt(position: number, range: { min: number; max: number }): number {
  return range.min + position * (range.max - range.min);
}

function positionFromMeters(meters: number, range: { min: number; max: number }, scaleMeters: number): number {
  const raw = meters / Math.max(1e-6, scaleMeters);
  return clamp01((raw - range.min) / Math.max(0.0001, range.max - range.min));
}

function formatElevationMeters(meters: number): string {
  return Math.round(meters).toLocaleString('en-US');
}

// Accepts what formatElevationMeters shows (commas) or a plain typed number.
function parseElevationMeters(text: string): number | null {
  const parsed = parseFloat(text.replace(/[,\sm]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function hexToRgb(hex: string): [number, number, number] {
  const parsed = parseInt(hex.slice(1), 16);
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

function mixHex(colorA: string, colorB: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(colorA);
  const [br, bg, bb] = hexToRgb(colorB);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `#${[mix(ar, br), mix(ag, bg), mix(ab, bb)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Standard RGB -> HSL conversion (Smith, 1978, the algorithm every color
// picker/CSS implementation already uses, not derived here).
function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(lightness * 100)];
  const delta = max - min;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  return [hue, Math.round(saturation * 100), Math.round(lightness * 100)];
}

type ColorCodeFormat = 'hex' | 'rgb' | 'hsl';

// No "rgb(...)"/"hsl(...)" wrapper — Dana: "if i switched to rgb, no need
// to write that in the color code, same for hsl." The format dropdown
// already says which one it is.
function formatColorCode(hex: string, format: ColorCodeFormat): string {
  if (format === 'hex') return hex;
  if (format === 'rgb') return hexToRgb(hex).join(', ');
  const [h, s, l] = hexToHsl(hex);
  return `${h}, ${s}%, ${l}%`;
}

// Linear interpolation across the stops, matching terrainRampColor's
// own math (shaders/terrain.glsl) closely enough for a UI preview — not
// pixel-identical to the shader (sRGB-vs-linear blending differences aren't
// worth chasing for a swatch), same as any gradient-editor preview bar.
function rampColorAt(stops: ColorStop[], t: number): string {
  const all = [...stops].sort((a, b) => a.position - b.position);
  if (t <= all[0].position) return all[0].color;
  if (t >= all[all.length - 1].position) return all[all.length - 1].color;
  for (let i = 0; i < all.length - 1; i++) {
    if (t >= all[i].position && t <= all[i + 1].position) {
      const span = Math.max(0.0001, all[i + 1].position - all[i].position);
      return mixHex(all[i].color, all[i + 1].color, (t - all[i].position) / span);
    }
  }
  return all[all.length - 1].color;
}

// How far a dragged handle has to move off the bar before releasing it
// deletes the stop instead of just repositioning it — the same "drag it
// away" convention Blender/After Effects use for removing a ramp stop or
// keyframe, not an invented gesture.
const DELETE_DRAG_DISTANCE = 40;

// Fewer than two stops is just a flat color, which Base color already is.
const MIN_COLOR_STOPS = 2;

// Total pointer movement (down to up) below this, in px, counts as a click
// rather than a drag — Dana: "when clicking on them the color picker
// should pop up." Distinguishes "picked this stop up and put it back down
// in the same spot" (click) from "dragged it" (reposition/delete), since
// both start with the same pointerdown.
const CLICK_MOVEMENT_THRESHOLD = 5;

// A CSS linear-gradient built from the same stop list, for the bar's own
// background — the browser does the actual interpolation, this only needs
// to hand it ascending color-stop pairs.
function cssGradient(stops: ColorStop[]): string {
  const all = [...stops].sort((a, b) => a.position - b.position);
  const stopList = all.map((stop) => `${stop.color} ${(stop.position * 100).toFixed(1)}%`).join(', ');
  return `linear-gradient(to right, ${stopList})`;
}

// A real multi-stop gradient ramp editor — the Blender Color Ramp/Figma
// gradient-editor convention (ROADMAP.md Stage 07.4), replacing the old
// fixed Base/Mid/High three-stop pickers. Every stop is equal: freely added,
// dragged, typed into or removed, between MIN_COLOR_STOPS and
// MAX_COLOR_STOPS (GLSL ES 1.00's fixed-size ramp array, see
// shaders/terrain.glsl). baseColor is only the flat color shown here when
// the ramp is off (Dana, 2026-10-21).
export function ColorRampEditor({
  baseColor,
  onBaseColorChange,
  stops,
  onStopsChange,
  rampActive,
  elevationRange,
  elevationScaleMeters,
  positionLabel = 'Elevation (m)',
  positionToMeters = (position: number) => rawElevationAt(position, elevationRange) * elevationScaleMeters,
  metersToPosition = (meters: number) => positionFromMeters(meters, elevationRange, elevationScaleMeters),
}: ColorRampEditorProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  // An index into `stops`, or null for none selected.
  const [selected, setSelected] = useState<number | null>(null);
  const draggingIndex = useRef<number | null>(null);
  // Set mid-drag once a handle's moved far enough off the bar that
  // releasing it now deletes the stop instead of repositioning it — see
  // DELETE_DRAG_DISTANCE. Tinted as a warning (not dimmed — dimming read as
  // "disabled," not "about to be removed," Dana 2026-10-21), full opacity.
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  // Set only once a drag-release actually triggers deletion, for a brief
  // fade-out before the stop is really removed — Dana: "would be better if
  // it just disappeared (fade)," replacing the old dim-then-vanish feel.
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const DELETE_FADE_MS = 150;
  // Pointerdown's own clientX/Y, to tell a click from a drag on release —
  // see CLICK_MOVEMENT_THRESHOLD. null whenever no pin is currently pressed.
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  // One shared native color input, reused for whichever stop was last
  // clicked (openColorPicker sets its value + which index owns it, then
  // triggers it) — the same technique ui/UIElements.tsx's own ColorPicker
  // uses (a real <input type="color">, not a custom popup built from
  // scratch), just hidden and opened programmatically instead of being the
  // visible control itself.
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const colorInputTarget = useRef<number | null>(null);

  function openColorPicker(index: number) {
    const input = colorInputRef.current;
    if (!input) return;
    colorInputTarget.current = index;
    input.value = stops[index].color;
    // Moved under the clicked pin, since the native picker opens at its input.
    input.style.left = `${stops[index].position * 100}%`;
    input.click();
  }

  function handleHiddenColorChange(event: React.ChangeEvent<HTMLInputElement>) {
    const index = colorInputTarget.current;
    if (index === null) return;
    const value = event.target.value;
    onStopsChange(stops.map((stop, i) => (i === index ? { ...stop, color: value } : stop)));
  }
  // Which text format the column list below shows every color's code in —
  // Dana: "depends on the code type - rgb, hex, hsl, etc." One shared
  // format for the whole list, not per-row, so they stay comparable.
  const [codeFormat, setCodeFormat] = useState<ColorCodeFormat>('hex');

  function positionFromEvent(event: { clientX: number }): number {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return clamp01((event.clientX - rect.left) / rect.width);
  }

  // Typing an elevation moves that stop there, same as dragging its pin;
  // values past the terrain's own low/high clamp to its ends.
  function commitStopElevation(index: number, text: string) {
    const meters = parseElevationMeters(text);
    if (meters === null) return;
    const position = metersToPosition(meters);
    onStopsChange(stops.map((stop, i) => (i === index ? { ...stop, position } : stop)));
  }

  // Click-drag on an elevation box scrubs the stop's elevation like the
  // sliders' number fields do (Slider in ui/UIElements.tsx); a click without
  // movement focuses it for typing. Cmd/Ctrl snaps to whole 100 m.
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  function handleElevationMouseDown(event: React.MouseEvent<HTMLInputElement>, index: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const field = event.currentTarget;
    const spanMeters = Math.max(1, positionToMeters(1) - positionToMeters(0));
    const metersPerPixel = spanMeters / 200; // about 200 px sweeps the whole range
    let meters = positionToMeters(stopsRef.current[index].position);
    let hasMoved = false;

    const onMove = (moveEvent: MouseEvent) => {
      hasMoved = true;
      meters += moveEvent.movementX * metersPerPixel;
      const next = moveEvent.metaKey || moveEvent.ctrlKey ? Math.round(meters / 100) * 100 : meters;
      const position = metersToPosition(next);
      onStopsChange(stopsRef.current.map((stop, i) => (i === index ? { ...stop, position } : stop)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!hasMoved) {
        field.focus();
        field.select();
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function deleteStop(index: number) {
    if (stops.length <= MIN_COLOR_STOPS) return;
    onStopsChange(stops.filter((_, i) => i !== index));
    setSelected(null);
  }

  // Same real deletion, just preceded by a brief opacity fade instead of
  // vanishing instantly — used everywhere a stop gets removed, so every
  // path (drag-away, the list's own delete button, Backspace) feels the
  // same way.
  function deleteStopWithFade(index: number) {
    if (stops.length <= MIN_COLOR_STOPS) return;
    setDeletingIndex(index);
    setTimeout(() => {
      deleteStop(index);
      setDeletingIndex(null);
    }, DELETE_FADE_MS);
  }

  // Backspace/Delete removes the selected stop — a document-level listener
  // rather than the handle button's own onKeyDown, since clicking a button
  // doesn't reliably give it keyboard focus in every browser (Safari's
  // default "Full Keyboard Access" setting is the known case). Ignored
  // while focus is actually in a text field, so deleting ramp stops never
  // fights with editing a hex color value.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (selected === null) return;
      if (event.key !== 'Backspace' && event.key !== 'Delete') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      event.preventDefault();
      deleteStopWithFade(selected);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deleteStopWithFade closes over stops/onStopsChange, which already change identity whenever stops itself does, re-subscribing on selected alone is enough
  }, [selected, stops]);

  function handleBarPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Only fires for a click landing on the bar itself, not on a stop handle
    // (those stop propagation in their own handler below) — adds a new
    // stop at the clicked position, its starting color sampled from the
    // ramp's own current color there, the same "insert" convention
    // Blender's Color Ramp uses.
    if (stops.length >= MAX_COLOR_STOPS) return;
    const position = positionFromEvent(event);
    const color = rampColorAt(stops, position);
    const nextStops = [...stops, { position, color }];
    onStopsChange(nextStops);
    setSelected(nextStops.length - 1);
  }

  function handleHandlePointerDown(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingIndex.current = index;
    dragStart.current = { x: event.clientX, y: event.clientY };
    setSelected(index);
  }

  function handleHandlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const index = draggingIndex.current;
    if (index === null) return;
    const bar = barRef.current;
    const barCenterY = bar ? bar.getBoundingClientRect().top + bar.getBoundingClientRect().height / 2 : event.clientY;
    const awayFromBar = Math.abs(event.clientY - barCenterY) > DELETE_DRAG_DISTANCE;
    setPendingDeleteIndex(awayFromBar ? index : null);
    if (awayFromBar) return; // stays at its last real position while flagged, doesn't also jump to the cursor's x
    const position = positionFromEvent(event);
    const nextStops = stops.map((stop, i) => (i === index ? { ...stop, position } : stop));
    onStopsChange(nextStops);
  }

  function handleHandlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId);
    const index = draggingIndex.current;
    draggingIndex.current = null;
    const start = dragStart.current;
    dragStart.current = null;
    if (index !== null && pendingDeleteIndex === index) {
      deleteStopWithFade(index);
      setPendingDeleteIndex(null);
      return;
    }
    setPendingDeleteIndex(null);
    if (index !== null && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < CLICK_MOVEMENT_THRESHOLD) {
      openColorPicker(index);
    }
  }

  // Every stop in one ascending-position list — Dana: "i would want to see
  // all picked colors in a column with their color code." `index` is the
  // stop's real index into `stops`.
  const allEntries = stops
    .map((stop, index) => ({ key: `stop-${index}`, position: stop.position, color: stop.color, index }))
    .sort((a, b) => a.position - b.position);

  // Ramp off: it doesn't apply, so only the plain base color makes sense to
  // show, same plain row every other single-color control in this panel
  // uses, not the ramp's own machinery. See rampActive's own comment above.
  if (!rampActive) {
    return <ColorPicker label="Color" value={baseColor} onChange={onBaseColorChange} />;
  }

  return (
    <div className="ui-ramp-editor">
      <Select
        label="Code format"
        value={codeFormat}
        onChange={(value) => setCodeFormat(value as ColorCodeFormat)}
        options={[
          { value: 'hex', label: 'Hex' },
          { value: 'rgb', label: 'RGB' },
          { value: 'hsl', label: 'HSL' },
        ]}
      />
      {/* Column headers, one per column (Dana, 2026-10-21). */}
      <div className="ui-ramp-list-header">
        <span className="ui-ramp-list-header-label">Color code</span>
        <span className="ui-ramp-list-header-label ui-ramp-list-header-elevation">{positionLabel}</span>
      </div>
      <div className="ui-ramp-list">
        {allEntries.map((entry) => {
          const elevationText = formatElevationMeters(positionToMeters(entry.position));
          // Every box takes the widest number's width, so they line up.
          const elevationWidth = Math.max(...allEntries.map((other) => formatElevationMeters(positionToMeters(other.position)).length));
          return (
          <div
            key={entry.key}
            className={
              // Same row/label/swatch template as the base color control
              // (ColorPicker in ui/UIElements.tsx), per [B37].
              'ui-color-row ui-ramp-list-row' +
              (selected === entry.index ? ' ui-ramp-list-row--selected' : '') +
              (deletingIndex === entry.index ? ' ui-ramp-list-row--deleting' : '')
            }
            // Opens this row's own swatch, so the picker pops up at the row.
            onClick={(event) => {
              setSelected(entry.index);
              event.currentTarget.querySelector<HTMLInputElement>('.ui-color-swatch')?.click();
            }}
          >
            <input
              type="color"
              className="ui-color-swatch"
              value={entry.color}
              // Stops the row from re-clicking this same swatch.
              onClick={(event) => {
                event.stopPropagation();
                setSelected(entry.index);
              }}
              onChange={(event) => {
                const value = event.target.value;
                onStopsChange(stops.map((stop, i) => (i === entry.index ? { ...stop, color: value } : stop)));
              }}
            />
            <span className="ui-color-label">{formatColorCode(entry.color, codeFormat)}</span>
            {/* The design system's number field (Slider's own), typed into
                directly, sized to the widest number. */}
            <input
              type="text"
              className="ui-slider-field ui-ramp-list-elevation"
              defaultValue={elevationText}
              key={elevationText} // resyncs when the stop moves or the range changes
              style={{ width: `calc(${elevationWidth}ch + 16px)` }}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => handleElevationMouseDown(event, entry.index)}
              onBlur={(event) => commitStopElevation(entry.index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  event.currentTarget.value = elevationText;
                  event.currentTarget.blur();
                }
              }}
            />
            {stops.length <= MIN_COLOR_STOPS ? (
              // Keeps every elevation field lined up under its header.
              <span className="ui-ramp-delete-placeholder" />
            ) : (
              <button
                type="button"
                className="ui-ramp-delete-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteStopWithFade(entry.index);
                }}
                aria-label="Delete this color stop"
              >
                <CloseIcon />
              </button>
            )}
          </div>
          );
        })}
      </div>
      <div className="ui-ramp-bar" ref={barRef} onPointerDown={handleBarPointerDown} style={{ background: cssGradient(stops) }}>
        {/* One shared hidden input, reused for whichever pin was last
            clicked — see openColorPicker/handleHiddenColorChange. Kept in
            the layout (opacity: 0), not display: none, since some browsers
            won't open a native color picker from a programmatic .click() on
            an element that was never actually rendered. */}
        <input
          ref={colorInputRef}
          type="color"
          className="ui-ramp-hidden-color-input"
          onChange={handleHiddenColorChange}
          aria-hidden="true"
          tabIndex={-1}
        />
        {stops.map((stop, index) => (
          <button
            key={index}
            type="button"
            className={
              'ui-ramp-pin' +
              (selected === index ? ' ui-ramp-pin--selected' : '') +
              (pendingDeleteIndex === index ? ' ui-ramp-pin--pending-delete' : '') +
              (deletingIndex === index ? ' ui-ramp-pin--deleting' : '')
            }
            style={{ left: `${stop.position * 100}%`, background: stop.color }}
            onPointerDown={(event) => handleHandlePointerDown(event, index)}
            onPointerMove={handleHandlePointerMove}
            onPointerUp={handleHandlePointerUp}
            aria-label={`Color stop at ${(stop.position * 100).toFixed(0)}%`}
          />
        ))}
      </div>
    </div>
  );
}
