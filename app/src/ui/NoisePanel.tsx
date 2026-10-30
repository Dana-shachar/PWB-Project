import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { Slider, Select, Accordion, EditableText } from './UIElements';
import { LayerMaskButton } from './MaskControls';
import { MapView } from '../map/MapView';
import {
  NOISE_TYPE_OPTIONS,
  BLEND_MODE_OPTIONS,
  VORONOI_DISTANCE_OPTIONS,
  FRACTAL_TYPE_OPTIONS,
  type NoiseLayer,
  type NoiseType,
  type BlendMode,
  type VoronoiDistance,
  type FractalType,
  type StrokeRecord,
} from '../map/heightmap';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';
import { DiceIcon, EyeIcon } from './icons';
import { sliderRange } from '../map/noiseRanges';

// One contained tab per modifier (ui/NoisePanel.tsx's Modifiers section) —
// Gaea's fixed order: Domain warp → generator/Octaves → Ridged → Terrace.
// Each tab's own tooltip reuses the exact wording its expanded-state Toggle
// already has, so the explanation exists before expanding, not only after.
const MODIFIERS = [
  {
    key: 'domainWarp',
    label: 'Domain warp',
    enabledField: 'domainWarpEnabled',
    tooltip: "Distorts the noise's own coordinates before evaluating it, which bends straight features into swirls instead of adding more detail.",
  },
  {
    key: 'octaves',
    label: 'Octaves (fBm)',
    enabledField: 'octavesEnabled',
    tooltip: 'Layers several copies of the noise at increasing frequency and decreasing strength (fractal Brownian motion), adding fine detail on top of the broad shape.',
  },
  {
    key: 'ridged',
    label: 'Ridged',
    enabledField: 'ridgedEnabled',
    tooltip: 'Folds the noise around its midpoint so values near zero become peaks, turning smooth rolling hills into sharp mountain ridges.',
  },
  {
    key: 'terrace',
    label: 'Terrace',
    enabledField: 'terraceEnabled',
    tooltip: 'Quantizes the noise into flat steps, giving terrain a stepped, terraced look instead of a smooth continuous slope.',
  },
] as const;

// One modifier's section: its name and hover text from MODIFIERS, its on/off switch in the header.
function ModifierSection({ modifierKey, selectedLayer, onUpdateSelectedLayer, children }: {
  modifierKey: (typeof MODIFIERS)[number]['key'];
  selectedLayer: NoiseLayer;
  onUpdateSelectedLayer: (patch: Partial<NoiseLayer>) => void;
  children: ReactNode;
}) {
  const modifier = MODIFIERS.find((each) => each.key === modifierKey)!;
  return (
    <Accordion
      title={modifier.label}
      nested
      description={modifier.tooltip}
      headerSwitch={{
        value: selectedLayer[modifier.enabledField] ?? false,
        onChange: (value) => onUpdateSelectedLayer({ [modifier.enabledField]: value }),
        label: `${modifier.label} on or off`,
      }}
    >
      {children}
    </Accordion>
  );
}

interface NoisePanelProps {
  layers: NoiseLayer[];
  // Click selects one exclusively; shift+click adds/removes it. The *last*
  // entry is the "primary" one — whose values the sliders below show, and
  // what painting targets (Dana, 2026-09-23).
  selectedLayerIds: string[];
  onLayerClick: (id: string, event: { shiftKey: boolean }) => void;
  onAddLayer: () => void;
  onDeleteLayer: (id: string) => void;
  onToggleLayerVisible: (id: string) => void;
  onRenameLayer: (id: string, name: string) => void;
  onReorderLayer: (draggedId: string, targetId: string) => void;
  // Applies to every selected layer at once, not just the primary one.
  onUpdateSelectedLayer: (patch: Partial<NoiseLayer>) => void;
  onUpdateLayers: (ids: string[], patch: Partial<NoiseLayer>) => void;
  onRandomizeTerrain: () => void;
  brushRadiusPx: number;
  onBrushRadiusPxChange: (value: number) => void;
  brushValue: number; // -1 (erase/black) .. 1 (paint/white)
  onBrushValueChange: (value: number) => void;
  feather: number; // 0=hard edge, 1=fully soft — a fraction of brushRadiusPx (Photoshop-style Hardness); never changes brush size
  onFeatherChange: (value: number) => void;
  sceneHandleRef: RefObject<SceneCanvasHandle | null>;
  onStrokeComplete: (record: StrokeRecord) => void;
  paintVersion: number;
  // Overall terrain height — global (drives both the planet's own
  // displacement and the land chunk's height directly, same value), not a
  // per-layer setting — see planet/planetControls.ts and ISSUES.md,
  // 2026-09-23 ("i think its a noise related slider"). Lives here, not
  // attached to any one layer, same as the noise canvas/brush controls above.
  heightScale: number;
  onHeightScaleChange: (value: number) => void;
  // Roughness: the planet-wide fine bumps under the layers (planet/planetControls.ts), next to Height (Dana, 2026-10-27).
  detailAmount: number;
  onDetailAmountChange: (value: number) => void;
  // Lifted up to App.tsx, not local state here — expanding now *replaces*
  // the 3D viewport's content with the full-size canvas (both side panels
  // stay visible) instead of a dark overlay on top of everything, so
  // App.tsx needs to know about it too, not just this panel. See
  // ISSUES.md, 2026-09-24.
  isMapExpanded: boolean;
  onMapExpandedChange: (value: boolean) => void;
}

// Content for the right panel's "Noise" tab (see RightPanel.tsx for the tab
// bar itself). Photoshop-style layer stack (Dana, 2026-09-15): bottom of
// `layers` is the base, applied first; each layer above composites onto the
// running result with its own blend mode + opacity. The visual list below
// renders top-of-stack first (reversed array order) to match Photoshop's
// own panel convention, even though the underlying array stays bottom-first.
export function NoisePanel({
  layers,
  selectedLayerIds,
  onLayerClick,
  onAddLayer,
  onDeleteLayer,
  onToggleLayerVisible,
  onRenameLayer,
  onReorderLayer,
  onUpdateSelectedLayer,
  onUpdateLayers,
  onRandomizeTerrain,
  brushRadiusPx,
  onBrushRadiusPxChange,
  brushValue,
  onBrushValueChange,
  feather,
  onFeatherChange,
  sceneHandleRef,
  onStrokeComplete,
  paintVersion,
  heightScale,
  onHeightScaleChange,
  detailAmount,
  onDetailAmountChange,
  isMapExpanded,
  onMapExpandedChange,
}: NoisePanelProps) {
  const primaryLayerId = selectedLayerIds[selectedLayerIds.length - 1];
  const selectedLayer = layers.find((layer) => layer.id === primaryLayerId) ?? layers[0];
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // The row actually being dragged switches to position:fixed and follows
  // the cursor (Dana, 2026-09-23: "i want to see the actual layer token
  // move by dragging", not a ghost copy) — position:fixed removes it from
  // the flex flow on its own, so the rest of the list reflows underneath
  // exactly as it already did.
  // Which modifier's params are currently shown — exclusive across the 4,
  // independent of each one's own enabled state (Dana, 2026-09-30).
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const dragGrabOffsetRef = useRef({ x: 0, y: 0 }); // cursor's position within the row at mousedown, so it doesn't jump to the row's corner
  const dragRowRectRef = useRef({ width: 0, left: 0 }); // pinned so the row keeps its own width/x once fixed-positioned, only y follows the cursor

  // Hand-rolled pointer drag (matches Slider's click-drag-to-scrub pattern,
  // ported from active-geometry's makeScrubber) — a plain click (no
  // movement past the threshold) selects the layer instead of reordering.
  function handleRowMouseDown(event: React.MouseEvent, layerId: string) {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const shiftKey = event.shiftKey; // captured at mousedown — decides click-select vs. shift-extend below
    let hasDragged = false;

    const rowEl = rowRefs.current.get(layerId);
    if (rowEl) {
      const rect = rowEl.getBoundingClientRect();
      dragGrabOffsetRef.current = { x: startX - rect.left, y: startY - rect.top };
      dragRowRectRef.current = { width: rect.width, left: rect.left };
    }

    function onMove(moveEvent: MouseEvent) {
      if (!hasDragged) {
        if (Math.abs(moveEvent.clientX - startX) < 4 && Math.abs(moveEvent.clientY - startY) < 4) return;
        hasDragged = true;
        setDraggedLayerId(layerId);
      }
      setDragPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
      let targetId: string | null = null;
      rowRefs.current.forEach((el, id) => {
        const rect = el.getBoundingClientRect();
        if (moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom) targetId = id;
      });
      if (targetId && targetId !== layerId) onReorderLayer(layerId, targetId);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDraggedLayerId(null);
      if (!hasDragged) onLayerClick(layerId, { shiftKey });
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <>
      <div className="panel-section">
        <Accordion title="Noise canvas">
          <button type="button" className="panel-text-btn" onClick={() => onMapExpandedChange(true)} disabled={isMapExpanded}>
            {isMapExpanded ? 'Expanded in viewport' : 'Expand'}
          </button>
          {/* TODO(DS): radius only for now — strength/size/shape come later, per Dana's 2026-09-15 simplification. */}
          <Slider
            label="Brush radius"
            unit="px"
            value={brushRadiusPx}
            onChange={onBrushRadiusPxChange}
            min={1}
            max={300}
            step={1}
            precision={0}
            description="How wide the brush paints, in screen pixels at the canvas's own resolution."
          />
          <Slider
            label="Brush"
            trackClassName="ui-slider-track--bw"
            value={brushValue}
            onChange={onBrushValueChange}
            min={-1}
            max={1}
            step={0.01}
            description="What the brush paints toward: -1 is black (erase/lower), 1 is white (paint/raise), 0 leaves terrain unchanged."
          />
          <Slider
            label="Feather"
            value={feather}
            onChange={onFeatherChange}
            min={0}
            max={1}
            step={0.01}
            description="How soft the brush's edge is, as a fraction of its radius — 0 is a hard edge, 1 fades fully across the stroke, matching Photoshop's hardness."
          />
          {/* Hidden, not just visually covered, while expanded — the same
              canvas is now shown full-size in the viewport instead (see
              App.tsx), so two mounted MapViews would both be capturing
              paint input for no reason. */}
          {!isMapExpanded && (
            <MapView
              layers={layers}
              selectedLayerId={primaryLayerId}
              brushRadiusPx={brushRadiusPx}
              brushValue={brushValue}
              feather={feather}
              sceneHandleRef={sceneHandleRef}
              onStrokeComplete={onStrokeComplete}
              paintVersion={paintVersion}
            />
          )}
        </Accordion>
      </div>

      <div className="panel-section-divider" />

      <div className="panel-section">
        <Accordion title="Terrain">
          {/* Global — shared directly with the planet's own displacement, not
              attached to any one layer (Dana, 2026-09-23). A percentage of
              context size (radius for the planet, footprint for the chunk),
              not an absolute scene-unit value — keeps the same number
              proportionally correct on both despite their wildly different
              absolute sizes (Dana, 2026-09-24: "can the height be in %?").
              See SceneCanvas.tsx, voxel/landChunk.ts, ISSUES.md. */}
          <Slider
            label="Height"
            unit="%"
            value={heightScale}
            onChange={onHeightScaleChange}
            min={0}
            max={100}
            step={0.5}
            precision={1}
            description="Overall terrain relief, as a percentage of whichever view you're in — the same number reads correctly against the planet's radius and the chunk's much smaller footprint."
          />
          <Slider
            label="Roughness"
            value={detailAmount}
            onChange={onDetailAmountChange}
            min={0}
            max={1}
            step={0.005}
            precision={3}
            description="Small-scale bumps added to the terrain's shape under your layers. Part of the terrain itself, not display quality: it shows up as you zoom in close enough to see it. 0 turns it off."
          />
        </Accordion>
      </div>

      <div className="panel-section-divider" />

      <div className="panel-section">
        <Accordion title="Layers">
        {layers
          .slice()
          .reverse()
          .map((layer) => (
            <div
              key={layer.id}
              ref={(el) => {
                if (el) rowRefs.current.set(layer.id, el);
                else rowRefs.current.delete(layer.id);
              }}
              className={
                'noise-layer-row' +
                (selectedLayerIds.includes(layer.id) ? ' noise-layer-row--selected' : '') +
                (layer.id === draggedLayerId ? ' noise-layer-row--dragging' : '') +
                (layer.visible === false ? ' noise-layer-row--hidden' : '')
              }
              style={
                layer.id === draggedLayerId
                  ? {
                      position: 'fixed',
                      left: dragRowRectRef.current.left,
                      top: dragPosition.y - dragGrabOffsetRef.current.y,
                      width: dragRowRectRef.current.width,
                    }
                  : undefined
              }
              onMouseDown={(event) => handleRowMouseDown(event, layer.id)}
            >
              <div className="noise-layer-row-main">
                <button
                  type="button"
                  className="panel-text-btn"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => onDeleteLayer(layer.id)}
                  disabled={layers.length === 1}
                >
                  ×
                </button>
                {/* stopPropagation so double-clicking/typing a name doesn't
                    also trigger the row's own drag-to-reorder/select
                    handler (handleRowMouseDown, on the row itself). Falls
                    back to the noise-type label for layers saved before
                    `name` existed. */}
                <span onMouseDown={(event) => event.stopPropagation()}>
                  <EditableText
                    className="noise-layer-row-label"
                    activateOn="doubleClick"
                    value={layer.name ?? NOISE_TYPE_OPTIONS.find((option) => option.value === layer.noiseType)?.label ?? layer.noiseType}
                    onCommit={(name) => onRenameLayer(layer.id, name)}
                  />
                </span>
              </div>
              {/* Photoshop-style hide/unhide (Dana, 2026-09-23) — independent
                  of selection, flips exactly this row. Hidden layers are
                  skipped entirely in the shader, so this updates the 2D
                  preview, the 3D planet, and the land chunk instantly, same
                  as any other layer edit. The whole row (not just this icon)
                  dims when hidden — see .noise-layer-row--hidden. */}
              <span className="noise-layer-row-actions">
                <LayerMaskButton layer={layer} selectedLayerIds={selectedLayerIds} onUpdateLayers={onUpdateLayers} />
                <button
                  type="button"
                  className="panel-text-btn noise-layer-row-visibility ui-tooltip-anchor"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={() => onToggleLayerVisible(layer.id)}
                >
                  <EyeIcon />
                  <span className="ui-tooltip">Show/hide this layer</span>
                </button>
              </span>
            </div>
          ))}
        <div className="panel-btn-row">
          <button type="button" className="noise-add-layer-btn" onClick={onAddLayer}>
            + Add layer
          </button>
          {/* Reseeds every layer at once — press it, get a different world,
              the most direct demonstration that this is a procedural system
              rather than hand-authored terrain (Dana, 2026-10-13). */}
          <button type="button" className="noise-add-layer-btn ui-tooltip-anchor" onClick={onRandomizeTerrain}>
            <DiceIcon /> Randomize
            <span className="ui-tooltip">Reseeds every layer's noise type, frequency, modifiers and more</span>
          </button>
        </div>
        </Accordion>
      </div>

      <div className="panel-section-divider" />

      <div className="panel-section">
        <Accordion title="Noise">
        <Select
          label="Noise type"
          value={selectedLayer.noiseType}
          onChange={(value) => onUpdateSelectedLayer({ noiseType: value as NoiseType })}
          options={NOISE_TYPE_OPTIONS}
          description="The base generator this layer builds on. Random is pure static; Perlin and Simplex are smooth rolling noise; Voronoi gives cell-like, sharp-edged patterns."
        />
        {/* Voronoi only: its cell points and how distance to them is measured
            (Blender's Randomness and Distance, Gaea's Jitter and Function). */}
        {selectedLayer.noiseType === 'voronoi' && (
          <>
            <Select
              label="Distance"
              value={selectedLayer.voronoiDistance ?? 'euclidean'}
              onChange={(value) => onUpdateSelectedLayer({ voronoiDistance: value as VoronoiDistance })}
              options={VORONOI_DISTANCE_OPTIONS}
              description="How the distance to the nearest cell point is measured. Euclidean gives round cells, Manhattan diamond-shaped ones, Chebychev square ones."
            />
            <Slider
              label="Jitter"
              value={selectedLayer.voronoiJitter ?? 0.7}
              onChange={(value) => onUpdateSelectedLayer({ voronoiJitter: value })}
              {...sliderRange('voronoiJitter')}
              description="How far each cell's point strays from its cell's center. 0 gives a regular grid of cells, 1 is fully random."
            />
          </>
        )}
        <Slider
          label="Seed"
          value={selectedLayer.seed}
          onChange={(value) => onUpdateSelectedLayer({ seed: value })}
          {...sliderRange('seed')}
          precision={0}
          description="Which random variation of this noise type to generate. Same noise type and frequency, different seed, a different world — see Randomize below for all layers at once."
        />
        <Slider
          label="Frequency"
          value={selectedLayer.frequency}
          onChange={(value) => onUpdateSelectedLayer({ frequency: value })}
          {...sliderRange('frequency')}
          description="How many noise features fit across the surface. Low values are broad, continent-scale shapes; high values are small, dense detail."
        />
        {/* Translate and per-axis stretch, as Unity, Blender, Gaea and
            Terragen offer them; closed by default to keep the section short. */}
        <Accordion title="Transform" nested>
          <Slider
            label="Offset X"
            value={selectedLayer.offsetX ?? 0}
            onChange={(value) => onUpdateSelectedLayer({ offsetX: value })}
            {...sliderRange('offset')}
            description="Slides the noise along the X axis, in noise cells. A different way to get a new pattern than Seed, since the same shapes just move."
          />
          <Slider
            label="Offset Y"
            value={selectedLayer.offsetY ?? 0}
            onChange={(value) => onUpdateSelectedLayer({ offsetY: value })}
            {...sliderRange('offset')}
            description="Slides the noise along the Y axis, in noise cells."
          />
          <Slider
            label="Offset Z"
            value={selectedLayer.offsetZ ?? 0}
            onChange={(value) => onUpdateSelectedLayer({ offsetZ: value })}
            {...sliderRange('offset')}
            description="Slides the noise along the Z axis, in noise cells."
          />
          <Slider
            label="Stretch X"
            value={selectedLayer.stretchX ?? 1}
            onChange={(value) => onUpdateSelectedLayer({ stretchX: value })}
            {...sliderRange('stretch')}
            description="Scales the noise's frequency along the X axis. Above 1 squeezes features thinner along X, below 1 stretches them out."
          />
          <Slider
            label="Stretch Y"
            value={selectedLayer.stretchY ?? 1}
            onChange={(value) => onUpdateSelectedLayer({ stretchY: value })}
            {...sliderRange('stretch')}
            description="Scales the noise's frequency along the Y axis."
          />
          <Slider
            label="Stretch Z"
            value={selectedLayer.stretchZ ?? 1}
            onChange={(value) => onUpdateSelectedLayer({ stretchZ: value })}
            {...sliderRange('stretch')}
            description="Scales the noise's frequency along the Z axis."
          />
        </Accordion>
        <Slider
          label="Opacity"
          value={selectedLayer.opacity}
          onChange={(value) => onUpdateSelectedLayer({ opacity: value })}
          {...sliderRange('opacity')}
          description="How much this layer shows in the 2D shape/paint composite. Independent of Height below — a layer at 0 opacity still affects real elevation."
        />
        {/* Amplitude/strength, same concept as a height layer in Blender/
            World Machine/Gaea — real elevation from the terrain's zero,
            additive across layers, genuinely unrelated to Opacity/Blend
            Mode (which only govern the 2D shape/paint composite). Gets
            scaled again by the global Terrain "Height" slider above, so
            this is a relative multiplier between layers/features, not a
            physical unit itself (Dana, 2026-09-24). See ISSUES.md. */}
        <Slider
          label="Height"
          value={selectedLayer.heightScale ?? 1}
          onChange={(value) => onUpdateSelectedLayer({ heightScale: value })}
          {...sliderRange('layerHeight')}
          description="How much this layer contributes to real elevation, additive with every other layer and scaled again by the Terrain Height slider above. Unrelated to Opacity — this drives actual relief, not the 2D preview."
        />
        <Select
          label="Blend mode"
          value={selectedLayer.blendMode}
          onChange={(value) => onUpdateSelectedLayer({ blendMode: value as BlendMode })}
          options={BLEND_MODE_OPTIONS}
          description="How this layer's 2D shape composites with the layers below it — Photoshop-style blend modes (Normal, Add, Multiply and the rest)."
        />
        </Accordion>
      </div>

      {/* Independent, composable toggles layered onto the base generator, not separate noise types (Dana, 2026-09-30).
          One nested accordion per modifier with its on/off switch in the header, like every other section (Dana,
          2026-10-30, replacing the tab row). Hidden for 'none' (no generator content to modify). */}
      {selectedLayer.noiseType !== 'none' && (
        <>
          <div className="panel-section-divider" />
          <div className="panel-section">
            <Accordion title="Modifiers">
              <ModifierSection modifierKey="domainWarp" selectedLayer={selectedLayer} onUpdateSelectedLayer={onUpdateSelectedLayer}>
                <Slider
                  label="Warp strength"
                  value={selectedLayer.warpStrength}
                  onChange={(value) => onUpdateSelectedLayer({ warpStrength: value })}
                  {...sliderRange('warpStrength')}
                  description="How far the coordinates are pushed before evaluating the noise. Higher values bend features into stronger swirls."
                />
                <Slider
                  label="Warp scale"
                  value={selectedLayer.warpScale ?? 1}
                  onChange={(value) => onUpdateSelectedLayer({ warpScale: value })}
                  {...sliderRange('warpScale')}
                  description="How fine the warp's own pattern is. Low values give broad, slow bends; high values give tight, choppy ones."
                />
                <Slider
                  label="Warp octaves"
                  value={selectedLayer.warpOctaves ?? 1}
                  onChange={(value) => onUpdateSelectedLayer({ warpOctaves: value })}
                  {...sliderRange('warpOctaves')}
                  precision={0}
                  description="How many layered copies the warp is built from. More octaves roughen the bends with finer detail, at a higher cost to compute."
                />
              </ModifierSection>
              <ModifierSection modifierKey="octaves" selectedLayer={selectedLayer} onUpdateSelectedLayer={onUpdateSelectedLayer}>
                <Slider
                  label="Octaves"
                  value={selectedLayer.octaves}
                  onChange={(value) => onUpdateSelectedLayer({ octaves: value })}
                  {...sliderRange('octaves')}
                  precision={0}
                  description="How many layered copies to sum. More octaves add finer detail at a higher cost to compute. Zooming in on the planet adds finer octaves automatically."
                />
                <Select
                  label="Fractal type"
                  value={selectedLayer.fractalType ?? 'fbm'}
                  onChange={(value) => onUpdateSelectedLayer({ fractalType: value as FractalType })}
                  options={FRACTAL_TYPE_OPTIONS}
                  description="How the octaves combine. fBm adds them evenly. Multifractal and Hybrid vary the roughness by place. Hetero terrain keeps low ground smooth and high ground rough. Ridged multifractal makes sharp ridges with detail only on them."
                />
                {/* Offset applies to every type but fBm and multifractal; Gain only to hybrid and ridged. */}
                {['hybrid', 'hetero', 'ridgedMulti'].includes(selectedLayer.fractalType ?? 'fbm') && (
                  <Slider
                    label="Fractal offset"
                    value={selectedLayer.fractalOffset ?? 0}
                    onChange={(value) => onUpdateSelectedLayer({ fractalOffset: value })}
                    {...sliderRange('fractalOffset')}
                    description="Shifts the noise before the octaves combine (Blender's Offset). It sets the base height the rougher octaves build on, and how much of the ground stays smooth."
                  />
                )}
                {['hybrid', 'ridgedMulti'].includes(selectedLayer.fractalType ?? 'fbm') && (
                  <Slider
                    label="Fractal gain"
                    value={selectedLayer.fractalGain ?? 1}
                    onChange={(value) => onUpdateSelectedLayer({ fractalGain: value })}
                    {...sliderRange('fractalGain')}
                    description="How strongly each octave lets the next, finer one show (Blender's Gain). Higher values make rough areas rougher and leave smooth areas smoother."
                  />
                )}
                <Slider
                  label="Persistence"
                  value={selectedLayer.persistence}
                  onChange={(value) => onUpdateSelectedLayer({ persistence: value })}
                  {...sliderRange('persistence')}
                  description="How much each added octave is scaled down from the last. Higher values keep fine detail loud relative to the broad shape."
                />
                <Slider
                  label="Lacunarity"
                  value={selectedLayer.lacunarity}
                  onChange={(value) => onUpdateSelectedLayer({ lacunarity: value })}
                  {...sliderRange('lacunarity')}
                  description="How much each added octave's frequency increases from the last. Higher values pack detail in tighter."
                />
              </ModifierSection>
              <ModifierSection modifierKey="ridged" selectedLayer={selectedLayer} onUpdateSelectedLayer={onUpdateSelectedLayer}>
                {/* ridge() has no natural continuous parameter of its own
                    to gate (unlike the other 3 modifiers' existing
                    sliders) — this blends un-ridged -> fully-ridged
                    (Dana, 2026-09-30: "how would you control the amount
                    of it?"). */}
                <Slider
                  label="Ridge amount"
                  value={selectedLayer.ridgeAmount ?? 1}
                  onChange={(value) => onUpdateSelectedLayer({ ridgeAmount: value })}
                  {...sliderRange('ridgeAmount')}
                  description="Blends between the plain noise and the fully ridged version. 0 is unridged, 1 is fully folded into peaks."
                />
                <Slider
                  label="Ridge offset"
                  value={selectedLayer.ridgeOffset ?? 1}
                  onChange={(value) => onUpdateSelectedLayer({ ridgeOffset: value })}
                  {...sliderRange('ridgeOffset')}
                  description="Where the fold sits (Blender's Offset). Lower values push the ridges down, higher values raise them."
                />
                <Slider
                  label="Ridge gain"
                  value={selectedLayer.ridgeGain ?? 1}
                  onChange={(value) => onUpdateSelectedLayer({ ridgeGain: value })}
                  {...sliderRange('ridgeGain')}
                  description="How strongly a ridge lets the next, finer octave show (Blender's Gain). Higher values give sharper, busier ridges."
                />
              </ModifierSection>
              <ModifierSection modifierKey="terrace" selectedLayer={selectedLayer} onUpdateSelectedLayer={onUpdateSelectedLayer}>
                <Slider
                  label="Terrace steps"
                  value={selectedLayer.terraceSteps}
                  onChange={(value) => onUpdateSelectedLayer({ terraceSteps: value })}
                  {...sliderRange('terraceSteps')}
                  precision={0}
                  description="How many flat steps the full height range is divided into. Fewer steps make each terrace taller and more pronounced."
                />
              </ModifierSection>
            </Accordion>
          </div>
        </>
      )}
    </>
  );
}
