import { useState } from 'react';
import { Slider, Toggle, Select, Accordion, EditableText } from './UIElements';
import { PIPELINE_STAGES, type PipelineStage } from './pipelineStages';
import type { ProjectSummary } from '../firebase/storage';
import { DiceIcon, PaletteIcon } from './icons';
import { ColorRampEditor } from './panels/ColorRampEditor';
import type { ColorStop } from '../planet/colorRamp';

// 'voxel' only affects the land-chunk view for now — a display style, not a
// chunk-only feature (Dana, 2026-09-23), but the planet doesn't render
// blocky yet; selecting it there currently has no visible effect.
const DISPLAY_MODE_OPTIONS = [
  { value: 'shaded', label: 'Shaded' },
  { value: 'wireframe', label: 'Wireframe' },
  { value: 'voxel', label: 'Voxel' },
];

interface PanelProps {
  // Scene controls
  ambientLight: number;
  onAmbientLightChange: (value: number) => void;
  lightDirX: number;
  onLightDirXChange: (value: number) => void;
  lightDirY: number;
  onLightDirYChange: (value: number) => void;
  lightDirZ: number;
  onLightDirZChange: (value: number) => void;
  // The land chunk's own elevation, independent of the planet's — see
  // scene/sceneControls.ts, ISSUES.md [B28]. Every other light setting
  // stays shared between the two views, only this one doesn't.
  chunkLightDirZ: number;
  onChunkLightDirZChange: (value: number) => void;
  lightIntensity: number;
  onLightIntensityChange: (value: number) => void;
  specularStrength: number;
  onSpecularStrengthChange: (value: number) => void;
  shininess: number;
  onShininessChange: (value: number) => void;
  gridSpacing: number;
  onGridSpacingChange: (value: number) => void;
  gridVisible: boolean;
  onGridVisibleChange: (value: boolean) => void;
  // Planet controls
  radiusKm: number;
  onRadiusKmChange: (value: number) => void;
  baseColor: string;
  onBaseColorChange: (value: string) => void;
  displayMode: string; // 'shaded' | 'wireframe' | 'voxel'
  onDisplayModeChange: (value: string) => void;
  onRandomizeTerrain: () => void;
  // Elevation color ramp (shaders/terrain.glsl) — folded directly into the
  // Planet section under Base color, not a separate accordion (Dana,
  // 2026-10-13: "these shouldn't be separated" the first time, then "why
  // the f was this moved to the right" when it landed in the Terrain
  // pipeline stage instead of here — "it should go here", the Planet
  // section alongside Display/Radius/Resolution/Base color).
  colorByElevation: boolean;
  onColorByElevationChange: (value: boolean) => void;
  colorStops: ColorStop[];
  onColorStopsChange: (stops: ColorStop[]) => void;
  onRandomizeColors: () => void;
  // Heightmap self-shadowing — a lighting feature, stays with Scene/Lighting.
  shadowsEnabled: boolean;
  onShadowsEnabledChange: (value: boolean) => void;
  // Which pane the shared Radius/Size slider currently drives — 'planet' or
  // 'landChunk' when exactly one is in view/selected, null when both panes
  // are selected in Split (a view-specific control, not a joint one like
  // lighting/zoom — Dana, 2026-09-23/24: "only joint controls should be
  // enabled... not individual view specific ones"). See App.tsx.
  activeViewContext: 'planet' | 'landChunk' | null;
  // Edit controls
  canUndo: boolean;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;
  onReset: () => void;
  // Project settings
  projects: ProjectSummary[];
  currentPlanetId: string | null; // null briefly, until the initial load/auto-create resolves
  currentPlanetName: string | null;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onSaveProject: () => void;
  onRenameProject: (name: string) => void;
  onDeleteProject: (id: string) => void;
  // Land chunk (Stage 07)
  chunkResolution: number;
  onChunkResolutionChange: (value: number) => void;
  chunkSize: number;
  onChunkSizeChange: (value: number) => void;
  // Planet mesh — segments per cube face, previously hardcoded with nothing
  // able to reach it (Dana, 2026-10-13).
  meshSegments: number;
  onMeshSegmentsChange: (value: number) => void;
  // Pipeline-stage menu — the structural response to "reads as 3D software,
  // not a procedural system" feedback (Dana, 2026-09-30/2026-10-07; see
  // ROADMAP.md's Procedural System Feedback section). activeStage/
  // onStageChange select which one stage's detail RightPanel shows
  // (exclusive); stageEnabled/onToggleStageEnabled are independent — any
  // combination can be on at once, feeding the future Timeline control.
  activeStage: PipelineStage;
  onStageChange: (stage: PipelineStage) => void;
  stageEnabled: Record<PipelineStage, boolean>;
  onToggleStageEnabled: (stage: PipelineStage, value: boolean) => void;
  // User-resizable, not content-driven — see ui/panelResize.ts and App.tsx's
  // resize handle. Applied as an inline style, not CSS, since it's a
  // per-instance drag state, not a fixed design-token value.
  width: number;
}

// One pipeline-stage row — two independent controls, same decoupled
// select-vs-expand split already built for the Modifier tabs
// (ui/NoisePanel.tsx): clicking the label selects this stage (exclusive —
// drives what RightPanel shows); the chevron independently expands a small
// quick-settings area inline, starting with just an Enabled toggle (feeds
// gating/the future Timeline, not tied to selection at all).
function PipelineStageRow({
  label,
  active,
  expanded,
  enabled,
  onSelect,
  onToggleExpand,
  onToggleEnabled,
}: {
  label: string;
  active: boolean;
  expanded: boolean;
  enabled: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
  onToggleEnabled: (value: boolean) => void;
}) {
  return (
    <div className="pipeline-stage-row">
      <div className={'pipeline-stage-header' + (active ? ' pipeline-stage-header--active' : '')}>
        <button type="button" className="pipeline-stage-label" onClick={onSelect}>
          {/* A plain dot, not a filled box — the "enabled" signal moved
              here once the header itself stopped having its own
              background/border (Dana, 2026-10-07: accordions should read
              as plain full-width strips, not look like dropdown menus). */}
          {enabled && <span className="pipeline-stage-enabled-dot">●</span>}
          {label}
        </button>
        <button
          type="button"
          className={'pipeline-stage-chevron' + (expanded ? ' pipeline-stage-chevron--open' : '')}
          onClick={onToggleExpand}
        >
          ▾
        </button>
      </div>
      {expanded && (
        <div className="pipeline-stage-quick-settings">
          <Toggle label="Enabled" value={enabled} onChange={onToggleEnabled} />
        </div>
      )}
    </div>
  );
}

// Left-side control panel, divided into titled sections — ported from
// active-geometry-project's right-panel pattern (section() + ag-panel-section:
// a bold titled group, sections separated by a divider), mirrored to the left
// per this project's layout. Lighting slider ranges are also ported directly
// (ambient 0-0.5/step 0.01, light X/Y -10-10/step 0.1) — the two things NOT
// borrowed (no convention exists for them in active-geometry) are the color
// picker and the grid-spacing range, both flagged where they're defined.
//
// "Project Settings" and "Edit" are collapsible (Dana, 2026-09-22 — they
// don't need to stay visible all the time), unlike Scene/Planet controls.
export function Panel({
  ambientLight,
  onAmbientLightChange,
  lightDirX,
  onLightDirXChange,
  lightDirY,
  onLightDirYChange,
  lightDirZ,
  onLightDirZChange,
  chunkLightDirZ,
  onChunkLightDirZChange,
  lightIntensity,
  onLightIntensityChange,
  specularStrength,
  onSpecularStrengthChange,
  shininess,
  onShininessChange,
  gridSpacing,
  onGridSpacingChange,
  gridVisible,
  onGridVisibleChange,
  radiusKm,
  onRadiusKmChange,
  baseColor,
  onBaseColorChange,
  displayMode,
  onDisplayModeChange,
  onRandomizeTerrain,
  colorByElevation,
  onColorByElevationChange,
  colorStops,
  onColorStopsChange,
  onRandomizeColors,
  shadowsEnabled,
  onShadowsEnabledChange,
  activeViewContext,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  onReset,
  projects,
  currentPlanetId,
  currentPlanetName,
  onSelectProject,
  onNewProject,
  onSaveProject,
  onRenameProject,
  onDeleteProject,
  chunkResolution,
  onChunkResolutionChange,
  chunkSize,
  onChunkSizeChange,
  meshSegments,
  onMeshSegmentsChange,
  activeStage,
  onStageChange,
  stageEnabled,
  onToggleStageEnabled,
  width,
}: PanelProps) {
  // Which stage rows have their own quick-settings expanded — independent
  // per row (unlike the Modifier tabs' single-open exclusivity), matching
  // how the rest of this panel's Accordions already behave (Project
  // Settings and Edit can both be open at once).
  const [expandedStages, setExpandedStages] = useState<Set<PipelineStage>>(new Set());

  function toggleExpanded(stage: PipelineStage) {
    setExpandedStages((previous) => {
      const next = new Set(previous);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  }

  return (
    <div className="panel-outer" style={{ width }}>
      <div className="panel-content">
        <div className="panel-section">
          <Accordion title="Project Settings">
            {/* Click-to-edit — replaces the old prompt-based Rename button,
                auto-saves under the new name via the existing debounced save. */}
            <EditableText className="project-name-text" value={currentPlanetName ?? ''} onCommit={onRenameProject} />
            {/* A nested accordion, not a dropdown — naming and switching live
                separately now (Dana, 2026-09-22: the two were conflated in
                one dropdown and it wasn't working well). `nested` styles it
                as subordinate to "Project Settings" (Dana, 2026-09-23 — the
                two read as equal-weight siblings without it). Same row style
                as the Layers list (ui/NoisePanel.tsx), click a row to load it. */}
            <Accordion title="My Projects" defaultOpen={false} nested>
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={'noise-layer-row' + (project.id === currentPlanetId ? ' noise-layer-row--selected' : '')}
                  onClick={() => onSelectProject(project.id)}
                >
                  <span className="noise-layer-row-label">{project.name}</span>
                  {/* Deleting the last remaining planet is allowed, unlike the
                      Layers list's delete — handleDeleteProject() auto-creates
                      a fresh blank one, so there's no "zero planets" state to
                      guard against. */}
                  <button
                    type="button"
                    className="panel-text-btn panel-text-btn--delete"
                    onClick={(event) => {
                      event.stopPropagation(); // don't also trigger the row's onSelectProject
                      onDeleteProject(project.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {/* An action on the projects list, not a peer of it — belongs
                  inside "My Projects" (Dana, 2026-09-23). */}
              <button type="button" className="panel-text-btn" onClick={onNewProject}>
                + New Project
              </button>
            </Accordion>
            <button type="button" className="noise-add-layer-btn" onClick={onSaveProject}>
              Save
            </button>
          </Accordion>
        </div>

        <div className="panel-section-divider" />

        <div className="panel-section">
          <Accordion title="Edit">
            <div className="panel-btn-row">
              {/* Mirrors the Cmd+Z/Ctrl+Z shortcut (see map/2Dbrush.ts) —
                  undoes the single most recent paint stroke, regardless of
                  which layer it's on. */}
              <button type="button" className="noise-add-layer-btn" onClick={onUndo} disabled={!canUndo}>
                Undo
              </button>
              {/* Mirrors Cmd+Shift+Z/Ctrl+Shift+Z — replays the most recently
                  undone stroke. */}
              <button type="button" className="noise-add-layer-btn" onClick={onRedo} disabled={!canRedo}>
                Redo
              </button>
              {/* Clears the current planet back to blank without switching
                  which saved planet is open — different from "+ New Project"
                  above. */}
              <button type="button" className="noise-add-layer-btn" onClick={onReset}>
                Reset
              </button>
            </div>
          </Accordion>
        </div>

        <div className="panel-section-divider" />

        <div className="panel-section">
          <Accordion title="Scene">
            <Slider
              label="Ambient light"
              value={ambientLight}
              onChange={onAmbientLightChange}
              min={0}
              max={0.5}
              step={0.01}
              description="The fill light. How bright the unlit side stays. Lower means deeper shadows; 0 makes anything facing away from the light go black."
            />
            <Slider
              label="Light intensity"
              value={lightIntensity}
              onChange={onLightIntensityChange}
              min={0}
              max={3}
              step={0.05}
              description="The key light's own strength. Raising this while Ambient light stays low is what separates a lit surface from shadow — the standard key-against-fill ratio."
            />
            <Slider
              label="X pos light"
              value={lightDirX}
              onChange={onLightDirXChange}
              min={-10}
              max={10}
              step={0.1}
              description="Where the light sits left to right. Low values graze the terrain and cast long shading; high values light it flat on."
            />
            <Slider
              label="Y pos light"
              value={lightDirY}
              onChange={onLightDirYChange}
              min={-10}
              max={10}
              step={0.1}
              description="Where the light sits up and down."
            />
            {/* The one light setting that doesn't stay shared between the
                planet and the chunk (Dana, 2026-10-20) — the chunk is a
                flat patch always facing one fixed direction, so an
                elevation tuned for the planet (where some point on the
                sphere always faces the light) can leave it dim; everything
                else above/below still rebinds to the same shared value
                either way. */}
            <Slider
              label="Light elevation"
              value={activeViewContext === 'landChunk' ? chunkLightDirZ : lightDirZ}
              onChange={activeViewContext === 'landChunk' ? onChunkLightDirZChange : onLightDirZChange}
              min={-10}
              max={10}
              step={0.1}
              description="How high the light sits above the terrain. Near 0 is a grazing, low sun, which casts the longest shadows and shows the most relief — the look of a landscape photo near sunrise."
            />
            <Slider
              label="Specular"
              value={specularStrength}
              onChange={onSpecularStrengthChange}
              min={0}
              max={1}
              step={0.01}
              description="How bright the highlight is where the surface catches the light directly. 0 removes it."
            />
            <Slider
              label="Shininess"
              value={shininess}
              onChange={onShininessChange}
              min={2}
              max={128}
              step={1}
              precision={0}
              description="How tight the highlight is. Low values spread it into a soft sheen; high values pull it into a small, sharp glint."
            />
            {/* A lighting feature (terrain blocking light from reaching
                terrain behind it), not a terrain-generation one, so it sits
                here rather than with the elevation color ramp, which moved
                to the Terrain stage instead (ui/NoisePanel.tsx) — see
                shaders/terrain.glsl. */}
            <Toggle
              label="Cast shadows"
              value={shadowsEnabled}
              onChange={onShadowsEnabledChange}
              description="Terrain blocks the light from reaching terrain behind it, the way real relief does. Land chunk only for now — the planet's curved surface is a separate follow-up."
            />
            {/* TODO(DS): grid spacing range not borrowed from active-geometry — it has no shader-plane grid */}
            <Slider
              label="Grid spacing"
              value={gridSpacing}
              onChange={onGridSpacingChange}
              min={1}
              max={50}
              step={1}
              precision={0}
            />
            <Toggle label="Grid lines" value={gridVisible} onChange={onGridVisibleChange} />
          </Accordion>
        </div>

        <div className="panel-section-divider" />

        <div className="panel-section">
          {/* Chunk folded in here, not its own section (Dana, 2026-10-07:
              "planet - size, resolution (sphere/ land chunk), color") — one
              Planet accordion, not a separate always-open "Chunk" section. */}
          <Accordion title="Planet">
            {/* Same action as the Layers section's own Randomize (Dana,
                2026-10-13: "add a random seed button at the top of the
                planet section") — reseeds every layer at once, so it's
                reachable from here too without hunting through the Terrain
                stage. */}
            <button type="button" className="noise-add-layer-btn ui-tooltip-anchor" onClick={onRandomizeTerrain}>
              <DiceIcon /> Randomize
              <span className="ui-tooltip">Reseeds every layer's noise type, frequency, modifiers and more</span>
            </button>
            <Select
              label="Display"
              value={displayMode}
              onChange={onDisplayModeChange}
              options={DISPLAY_MODE_OPTIONS}
              description="Shaded is the real lit surface. Wireframe overlays the mesh's edges on top. Voxel gives the land chunk a blocky, cube-by-cube style (the planet doesn't render voxel yet)."
            />
            {/* One shared slider, not two — Radius (planet) and Size (chunk)
                are the same kind of control (the view's physical scale), so
                it relabels/rebinds to whichever pane is actually in view or
                selected instead of showing both at once (Dana, 2026-09-23/24:
                "the slider should actually change depending on the view").
                Disabled, not hidden, when both panes are selected in Split —
                it's a view-specific control, not a joint one. Falls back to
                the Radius binding while disabled so it doesn't blank out. */}
            <Slider
              label={activeViewContext === 'landChunk' ? 'Size' : 'Radius'}
              unit="km"
              value={activeViewContext === 'landChunk' ? chunkSize : radiusKm}
              onChange={activeViewContext === 'landChunk' ? onChunkSizeChange : onRadiusKmChange}
              min={activeViewContext === 'landChunk' ? 4 : 1000}
              max={activeViewContext === 'landChunk' ? 64 : 100000}
              step={activeViewContext === 'landChunk' ? 1 : 100}
              precision={0}
              disabled={activeViewContext === null}
              description={
                activeViewContext === 'landChunk'
                  ? 'How much ground the land chunk covers, in kilometers. Detail only comes from Resolution below, not from this.'
                  : "The planet's physical radius, in kilometers. Select the planet or chunk pane to control that view's own scale."
              }
            />
            {/* Contextual, the same pattern as the Radius/Size slider above:
                rebinds to whichever pane is in view rather than showing two
                separate controls (Dana, 2026-10-13 — this is the same kind
                of control in both places, how finely that pane's own mesh
                is divided). The planet's own segment count was hardcoded at
                32 with nothing able to reach it until now, which is what
                gave the planet its faceted silhouette once displacement
                pushed those few vertices out a long way.
                Detail only — doesn't affect either pane's physical size,
                which lives in the Radius/Size slider above (Dana,
                2026-09-23: it used to, incidentally, for the chunk). The
                chunk's own max is 2048, matching MAX_PATCH_TEXTURE_RESOLUTION
                (planet/patch.ts) — the real guaranteed WebGL2 texture-size
                floor, a hardware-grounded ceiling now, not a round number,
                for the GPU-only texture smooth/shaded mode bakes into. Past
                2026-09-23's original
                triangle-count worry: smooth mode's own mesh density is now
                fixed regardless of this slider (voxel/landChunk.ts), so
                that risk no longer applies there, only voxel mode's own
                mesh still scales with resolution, bounded separately by
                clampPatchSamples' own lower cap. See ISSUES.md, [B32]. The
                planet's own max is 128, matching MAX_PATCH_GRID_RESOLUTION
                (planet/patch.ts) — now a per-patch mesh resolution, not the
                old single whole-globe mesh's segment count (patches render
                the planet now, each with its own grid, see [B28]); 128 is a
                deliberate, conservative ceiling since a patch already
                covers far less area than a whole cube face did. */}
            <Slider
              label="Resolution"
              value={activeViewContext === 'landChunk' ? chunkResolution : meshSegments}
              onChange={activeViewContext === 'landChunk' ? onChunkResolutionChange : onMeshSegmentsChange}
              min={activeViewContext === 'landChunk' ? 8 : 8}
              max={activeViewContext === 'landChunk' ? 2048 : 128}
              step={activeViewContext === 'landChunk' ? 8 : 4}
              precision={0}
              disabled={activeViewContext === null}
              description={
                activeViewContext === 'landChunk'
                  ? "How finely the land chunk's own ground is measured. Independent of Size above — you can zoom into a low-resolution patch and still see it as low-resolution."
                  : "How finely each visible patch's own ground is measured — every patch you see rebuilds at this resolution, same control as before, now reaching what's actually on screen."
              }
            />
            {/* Every color control grouped under its own named subsection
                (Dana, 2026-10-21), not loose in Planet's own body. */}
            <Accordion title="Color" nested>
              {/* Gates the whole group below (Dana, 2026-10-14) — a
                  labelled placeholder for Stage 11's real height+climate+
                  biome color shader (ROADMAP.md), not that shader itself. */}
              <Toggle
                label="Color by elevation"
                value={colorByElevation}
                onChange={onColorByElevationChange}
                description="Blends the gradient ramp below by height instead of the flat Base color alone. Off by default."
              />
              <ColorRampEditor
                baseColor={baseColor}
                onBaseColorChange={onBaseColorChange}
                stops={colorStops}
                onStopsChange={onColorStopsChange}
                rampActive={colorByElevation}
              />
              {/* Rotates a hue, it doesn't pick three independent random RGB
                  values — see planetControls.ts's randomTerrainPalette() for
                  the conventions this follows. */}
              <button type="button" className="noise-add-layer-btn ui-tooltip-anchor" onClick={onRandomizeColors}>
                <PaletteIcon /> Randomize colors
                <span className="ui-tooltip">Rotates a related hue for Base/Mid/High, not independent colors</span>
              </button>
            </Accordion>
          </Accordion>
        </div>

        <div className="panel-section-divider" />

        <div className="panel-section">
          {PIPELINE_STAGES.map((stage) => (
            <PipelineStageRow
              key={stage.key}
              label={stage.label}
              active={activeStage === stage.key}
              expanded={expandedStages.has(stage.key)}
              enabled={stageEnabled[stage.key]}
              onSelect={() => onStageChange(stage.key)}
              onToggleExpand={() => toggleExpanded(stage.key)}
              onToggleEnabled={(value) => onToggleStageEnabled(stage.key, value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
