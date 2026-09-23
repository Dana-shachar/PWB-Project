import { Slider, ColorPicker, Toggle, Select, Accordion, EditableText } from './UIElements';
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
  // Overall terrain height — shared directly with the land chunk's own
  // height, not a Planet-exclusive setting despite living in this section
  // (Dana, 2026-09-23). See planet/planetControls.ts.
  heightScale: number;
  onHeightScaleChange: (value: number) => void;
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
  heightScale,
  onHeightScaleChange,
}: PanelProps) {
  return (
    <div className="panel-outer">
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
            {/* Mirrors the Cmd+Z/Ctrl+Z shortcut (see map/2Dbrush.ts) — undoes
                the single most recent paint stroke, regardless of which layer
                it's on. */}
            <button type="button" className="noise-add-layer-btn" onClick={onUndo} disabled={!canUndo}>
              Undo
            </button>
            {/* Mirrors Cmd+Shift+Z/Ctrl+Shift+Z — replays the most recently
                undone stroke. */}
            <button type="button" className="noise-add-layer-btn" onClick={onRedo} disabled={!canRedo}>
              Redo
            </button>
            {/* Clears the current planet back to blank without switching which
                saved planet is open — different from "+ New Project" above. */}
            <button type="button" className="noise-add-layer-btn" onClick={onReset}>
              Reset
            </button>
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
          <Slider
            label="Radius"
            unit="km"
            value={radiusKm}
            onChange={onRadiusKmChange}
            min={1000}
            max={100000}
            step={100}
            precision={0}
          />
          <ColorPicker label="Base color" value={baseColor} onChange={onBaseColorChange} />
          {/* Shared directly with the land chunk's own height — not derived
              from Radius anymore (Dana, 2026-09-23: "it's overall height...
              the chunk is eventually a part of the planet"). */}
          <Slider
            label="Height"
            value={heightScale}
            onChange={onHeightScaleChange}
            min={0}
            max={50}
            step={0.5}
          />
        </div>

        <div className="panel-section-divider" />

        <div className="panel-section">
          <div className="panel-section-title">Land Chunk</div>
          {/* Detail only — doesn't affect the footprint's physical size
              (Dana, 2026-09-23: it used to, incidentally). */}
          <Slider
            label="Resolution"
            value={chunkResolution}
            onChange={onChunkResolutionChange}
            min={8}
            max={64}
            step={8}
            precision={0}
          />
          <Slider
            label="Size"
            value={chunkSize}
            onChange={onChunkSizeChange}
            min={4}
            max={64}
            step={1}
            precision={0}
          />
        </div>
      </div>
    </div>
  );
}
