import { useState } from 'react';
import { Slider, ColorPicker, Toggle, Select, Accordion, EditableText } from './UIElements';
import { PIPELINE_STAGES, type PipelineStage } from './pipelineStages';
import type { ProjectSummary } from '../firebase/storage';

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
          <div className="panel-section-title">Scene controls</div>
          <Slider
            label="Ambient light"
            value={ambientLight}
            onChange={onAmbientLightChange}
            min={0}
            max={0.5}
            step={0.01}
          />
          <Slider
            label="X pos light"
            value={lightDirX}
            onChange={onLightDirXChange}
            min={-10}
            max={10}
            step={0.1}
          />
          <Slider
            label="Y pos light"
            value={lightDirY}
            onChange={onLightDirYChange}
            min={-10}
            max={10}
            step={0.1}
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
        </div>

        <div className="panel-section-divider" />

        <div className="panel-section">
          <div className="panel-section-title">Planet controls</div>
          <Select
            label="Display"
            value={displayMode}
            onChange={onDisplayModeChange}
            options={DISPLAY_MODE_OPTIONS}
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
          />
          <ColorPicker label="Base color" value={baseColor} onChange={onBaseColorChange} />
        </div>

        <div className="panel-section-divider" />

        <div className="panel-section">
          <div className="panel-section-title">Chunk</div>
          {/* Detail only — doesn't affect the footprint's physical size,
              which now lives in the shared Radius/Size slider above
              (Dana, 2026-09-23: it used to, incidentally). Max raised
              64→512→2048 — 512 wasn't a hard ceiling either, just not yet
              pushed; true UHD (4096) is deliberately held back — the real
              constraint isn't resolution alone but worst-case triangle
              count for very noisy terrain, which at 4096 risks actually
              crashing the tab, not just running slow. See ISSUES.md,
              2026-09-23. No planet-side resolution control exists yet, so
              this stays chunk-only for now rather than forcing a merge
              with nothing on the other side. */}
          <Slider
            label="Resolution"
            value={chunkResolution}
            onChange={onChunkResolutionChange}
            min={8}
            max={2048}
            step={8}
            precision={0}
          />
        </div>

        <div className="panel-section-divider" />

        <div className="panel-section">
          <div className="panel-section-title">Pipeline</div>
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
