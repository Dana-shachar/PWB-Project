import { useRef, useState, type RefObject } from 'react';
import { Slider, Select, Toggle, Accordion, EditableText } from './UIElements';
import { MapView } from '../map/MapView';
import { NOISE_TYPE_OPTIONS, BLEND_MODE_OPTIONS, type NoiseLayer, type NoiseType, type BlendMode, type StrokeRecord } from '../map/heightmap';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';

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
          />
          <Slider
            label="Brush"
            trackClassName="ui-slider-track--bw"
            value={brushValue}
            onChange={onBrushValueChange}
            min={-1}
            max={1}
            step={0.01}
          />
          <Slider label="Feather" value={feather} onChange={onFeatherChange} min={0} max={1} step={0.01} />
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
        <div className="panel-section-title">Terrain</div>
        {/* Global — shared directly with the planet's own displacement, not
            attached to any one layer (Dana, 2026-09-23). A percentage of
            context size (radius for the planet, footprint for the chunk),
            not an absolute scene-unit value — keeps the same number
            proportionally correct on both despite their wildly different
            absolute sizes (Dana, 2026-09-24: "can the height be in %?").
            See SceneCanvas.tsx, voxel/landChunk.ts, ISSUES.md. */}
        <Slider label="Height" unit="%" value={heightScale} onChange={onHeightScaleChange} min={0} max={100} step={0.5} precision={1} />
      </div>

      <div className="panel-section-divider" />

      <div className="panel-section">
        <div className="panel-section-title">Layers</div>
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
              <button
                type="button"
                className="panel-text-btn noise-layer-row-visibility"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => onToggleLayerVisible(layer.id)}
              >
                👁
              </button>
            </div>
          ))}
        <button type="button" className="noise-add-layer-btn" onClick={onAddLayer}>
          + Add layer
        </button>
      </div>

      <div className="panel-section-divider" />

      <div className="panel-section">
        <div className="panel-section-title">Noise</div>
        <Select
          label="Noise type"
          value={selectedLayer.noiseType}
          onChange={(value) => onUpdateSelectedLayer({ noiseType: value as NoiseType })}
          options={NOISE_TYPE_OPTIONS}
        />
        <Slider
          label="Seed"
          value={selectedLayer.seed}
          onChange={(value) => onUpdateSelectedLayer({ seed: value })}
          min={0}
          max={1000}
          step={1}
          precision={0}
        />
        <Slider
          label="Frequency"
          value={selectedLayer.frequency}
          onChange={(value) => onUpdateSelectedLayer({ frequency: value })}
          min={0.5}
          max={20}
          step={0.1}
        />
        <Slider
          label="Opacity"
          value={selectedLayer.opacity}
          onChange={(value) => onUpdateSelectedLayer({ opacity: value })}
          min={0}
          max={1}
          step={0.01}
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
          min={0}
          max={10}
          step={0.1}
        />
        <Select
          label="Blend mode"
          value={selectedLayer.blendMode}
          onChange={(value) => onUpdateSelectedLayer({ blendMode: value as BlendMode })}
          options={BLEND_MODE_OPTIONS}
        />
      </div>

      {/* Independent, composable toggles layered onto the base generator
          above, not separate noise types (Dana, 2026-09-30: "Modifiers as
          toggles, not types"). Fixed order (Gaea): Domain warp → generator/
          Octaves → Ridged → Terrace — each reveals its own params only
          when checked. Hidden entirely for 'none' (no generator content to
          modify). See ISSUES.md. */}
      {selectedLayer.noiseType !== 'none' && (
        <>
          <div className="panel-section-divider" />
          <div className="panel-section">
            <div className="panel-section-title">Modifiers</div>
            <Toggle
              label="Domain warp"
              value={selectedLayer.domainWarpEnabled ?? false}
              onChange={(value) => onUpdateSelectedLayer({ domainWarpEnabled: value })}
            />
            {selectedLayer.domainWarpEnabled && (
              <Slider
                label="Warp strength"
                value={selectedLayer.warpStrength}
                onChange={(value) => onUpdateSelectedLayer({ warpStrength: value })}
                min={0}
                max={4}
                step={0.1}
              />
            )}
            <Toggle
              label="Octaves (fBm)"
              value={selectedLayer.octavesEnabled ?? false}
              onChange={(value) => onUpdateSelectedLayer({ octavesEnabled: value })}
            />
            {selectedLayer.octavesEnabled && (
              <>
                <Slider
                  label="Octaves"
                  value={selectedLayer.octaves}
                  onChange={(value) => onUpdateSelectedLayer({ octaves: value })}
                  min={1}
                  max={8}
                  step={1}
                  precision={0}
                />
                <Slider
                  label="Persistence"
                  value={selectedLayer.persistence}
                  onChange={(value) => onUpdateSelectedLayer({ persistence: value })}
                  min={0}
                  max={1}
                  step={0.05}
                />
                <Slider
                  label="Lacunarity"
                  value={selectedLayer.lacunarity}
                  onChange={(value) => onUpdateSelectedLayer({ lacunarity: value })}
                  min={1}
                  max={4}
                  step={0.1}
                />
              </>
            )}
            <Toggle
              label="Ridged"
              value={selectedLayer.ridgedEnabled ?? false}
              onChange={(value) => onUpdateSelectedLayer({ ridgedEnabled: value })}
            />
            {/* ridge() has no natural continuous parameter of its own to gate
                (unlike the other 3 modifiers' existing sliders) — this
                blends un-ridged -> fully-ridged (Dana, 2026-09-30: "how
                would you control the amount of it?"). */}
            {selectedLayer.ridgedEnabled && (
              <Slider
                label="Ridge amount"
                value={selectedLayer.ridgeAmount ?? 1}
                onChange={(value) => onUpdateSelectedLayer({ ridgeAmount: value })}
                min={0}
                max={1}
                step={0.01}
              />
            )}
            <Toggle
              label="Terrace"
              value={selectedLayer.terraceEnabled ?? false}
              onChange={(value) => onUpdateSelectedLayer({ terraceEnabled: value })}
            />
            {selectedLayer.terraceEnabled && (
              <Slider
                label="Terrace steps"
                value={selectedLayer.terraceSteps}
                onChange={(value) => onUpdateSelectedLayer({ terraceSteps: value })}
                min={2}
                max={20}
                step={1}
                precision={0}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}
