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
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
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

// Linear interpolation across baseColor + stops, matching terrainRampColor's
// own math (shaders/terrain.glsl) closely enough for a UI preview — not
// pixel-identical to the shader (sRGB-vs-linear blending differences aren't
// worth chasing for a swatch), same as any gradient-editor preview bar.
function rampColorAt(baseColor: string, stops: ColorStop[], t: number): string {
  const all = [{ position: 0, color: baseColor }, ...stops].sort((a, b) => a.position - b.position);
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

// Total pointer movement (down to up) below this, in px, counts as a click
// rather than a drag — Dana: "when clicking on them the color picker
// should pop up." Distinguishes "picked this stop up and put it back down
// in the same spot" (click) from "dragged it" (reposition/delete), since
// both start with the same pointerdown.
const CLICK_MOVEMENT_THRESHOLD = 5;

// A CSS linear-gradient built from the same stop list, for the bar's own
// background — the browser does the actual interpolation, this only needs
// to hand it ascending color-stop pairs.
function cssGradient(baseColor: string, stops: ColorStop[]): string {
  const all = [{ position: 0, color: baseColor }, ...stops].sort((a, b) => a.position - b.position);
  const stopList = all.map((stop) => `${stop.color} ${(stop.position * 100).toFixed(1)}%`).join(', ');
  return `linear-gradient(to right, ${stopList})`;
}

// A real multi-stop gradient ramp editor — the Blender Color Ramp/Figma
// gradient-editor convention (ROADMAP.md Stage 07.4), replacing the old
// fixed Base/Mid/High three-stop pickers. baseColor is always the stop at
// position 0 (Dana, 2026-10-13: "the base color should just serve as the
// low elevation color"), shown on the bar but not part of `stops` and not
// deletable; `stops` holds every stop after it, freely added, dragged, or
// removed, up to MAX_COLOR_STOPS total (GLSL ES 1.00's fixed-size ramp
// array, see shaders/terrain.glsl).
export function ColorRampEditor({ baseColor, onBaseColorChange, stops, onStopsChange, rampActive }: ColorRampEditorProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  // null = baseColor's own fixed stop selected; otherwise an index into
  // `stops`. Selecting reveals that one stop's own color picker + delete
  // button below the bar, same as Blender's own ramp widget.
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

  function openColorPicker(index: number | null) {
    const input = colorInputRef.current;
    if (!input) return;
    colorInputTarget.current = index;
    input.value = index === null ? baseColor : (stops[index]?.color ?? baseColor);
    input.click();
  }

  function handleHiddenColorChange(event: React.ChangeEvent<HTMLInputElement>) {
    const index = colorInputTarget.current;
    const value = event.target.value;
    if (index === null) onBaseColorChange(value);
    else onStopsChange(stops.map((stop, i) => (i === index ? { ...stop, color: value } : stop)));
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

  function deleteStop(index: number) {
    if (stops.length <= 1) return; // always keep at least one real stop beyond the fixed base color
    onStopsChange(stops.filter((_, i) => i !== index));
    setSelected(null);
  }

  // Same real deletion, just preceded by a brief opacity fade instead of
  // vanishing instantly — used everywhere a stop gets removed, so every
  // path (drag-away, the list's own delete button, Backspace) feels the
  // same way.
  function deleteStopWithFade(index: number) {
    if (stops.length <= 1) return;
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
    if (stops.length + 1 >= MAX_COLOR_STOPS) return; // +1 for baseColor's own slot
    const position = positionFromEvent(event);
    const color = rampColorAt(baseColor, stops, position);
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

  function handleBasePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    dragStart.current = { x: event.clientX, y: event.clientY };
    setSelected(null);
  }

  function handleBasePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const start = dragStart.current;
    dragStart.current = null;
    // Base never repositions/deletes (fixed at position 0), so any
    // down-then-up on it is a click — no movement threshold needed, but
    // still guards against a drag that started here and released elsewhere.
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < CLICK_MOVEMENT_THRESHOLD) {
      openColorPicker(null);
    }
  }

  // Base color plus every stop, in one ascending-position list — Dana:
  // "i would want to see all picked colors in a column with their color
  // code." `index` is null for the fixed base entry (not part of `stops`,
  // not deletable), otherwise its real index into `stops`.
  const allEntries = [
    { key: 'base', position: 0, color: baseColor, index: null as number | null },
    ...stops.map((stop, index) => ({ key: `stop-${index}`, position: stop.position, color: stop.color, index })),
  ].sort((a, b) => a.position - b.position);

  // Ramp off: it doesn't apply, so only the plain base color makes sense to
  // show, same plain row every other single-color control in this panel
  // uses, not the ramp's own machinery. See rampActive's own comment above.
  if (!rampActive) {
    return <ColorPicker label="Color" value={baseColor} onChange={onBaseColorChange} />;
  }

  return (
    <div className="ui-ramp-editor">
      {/* The format picker sits above the color list, which includes base
          color as its own first row, same template as every stop (Dana,
          2026-10-21: "move the color format above the base color... make
          all of the colors picked in the same template"), not a separate
          standalone color picker above the list. */}
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
      {/* A header labeling the position column — Dana, 2026-10-21: "i'm
          also missing an indication for the elevation of the color," the
          bare "%" by itself didn't say what it was a percentage of. */}
      <div className="ui-ramp-list-header">
        <span className="ui-ramp-list-header-position">Elevation</span>
      </div>
      <div className="ui-ramp-list">
        {allEntries.map((entry) => (
          <div
            key={entry.key}
            className={
              'ui-ramp-list-row' +
              (selected === entry.index ? ' ui-ramp-list-row--selected' : '') +
              (deletingIndex === entry.index ? ' ui-ramp-list-row--deleting' : '')
            }
            onClick={() => {
              setSelected(entry.index);
              openColorPicker(entry.index);
            }}
          >
            <span className="ui-ramp-list-swatch" style={{ background: entry.color }} />
            <span className="ui-ramp-list-code">{formatColorCode(entry.color, codeFormat)}</span>
            <span className="ui-ramp-list-position">{Math.round(entry.position * 100)}%</span>
            {entry.index !== null && stops.length > 1 && (
              <button
                type="button"
                className="ui-ramp-delete-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteStopWithFade(entry.index as number);
                }}
                aria-label="Delete this color stop"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="ui-ramp-bar" ref={barRef} onPointerDown={handleBarPointerDown} style={{ background: cssGradient(baseColor, stops) }}>
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
        {/* baseColor's own fixed stop, position 0, not part of `stops` and
            never draggable or deletable — see this component's own header
            comment for why. A plain click still opens its own color picker. */}
        <button
          type="button"
          className={'ui-ramp-pin' + (selected === null ? ' ui-ramp-pin--selected' : '')}
          style={{ left: '0%', background: baseColor }}
          onPointerDown={handleBasePointerDown}
          onPointerUp={handleBasePointerUp}
          aria-label="Base color stop (position 0)"
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
