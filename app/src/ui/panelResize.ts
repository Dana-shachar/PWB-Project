import { useState } from 'react';

const DEFAULT_PANEL_MIN_WIDTH = 360;
const DEFAULT_PANEL_MAX_WIDTH = 600;

// Drag-to-resize for the left/right panels (ui/Panel.tsx, ui/RightPanel.tsx)
// — ported from active-geometry-project's .ag-right-panel-handle pattern.
// Width only ever changes via an explicit user drag, never auto-adjusted by
// content (an accordion opening/closing, a right-panel tab switching) the
// way the earlier `width: max-content` did (Dana, 2026-09-30: "the panels
// width should be stable - not change when switching tabs or opening
// accordions... i didnt mean it to have a hard coded width"). minWidth is
// per-instance, not shared — the left panel's controls need less room than
// the right panel's (Dana, 2026-09-30: "the left side menu is a bit too
// wide... lower it's min value").
export function usePanelResize(
  initialWidth: number,
  anchorSide: 'left' | 'right',
  minWidth = DEFAULT_PANEL_MIN_WIDTH,
  maxWidth = DEFAULT_PANEL_MAX_WIDTH,
) {
  const [width, setWidth] = useState(initialWidth);

  // Mirrors voxel/landChunk.ts's startResize (the planet/chunk split
  // divider) — plain mousemove/mouseup against the panel's own bounding
  // box, not movementX deltas, so the handle tracks the cursor directly.
  function startResize(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    const container = anchorSide === 'left' ? event.currentTarget.previousElementSibling : event.currentTarget.nextElementSibling;
    const rect = container?.getBoundingClientRect();
    if (!rect) return;
    const fixedEdge = anchorSide === 'left' ? rect.left : rect.right;

    function onMove(moveEvent: MouseEvent) {
      const rawWidth = anchorSide === 'left' ? moveEvent.clientX - fixedEdge : fixedEdge - moveEvent.clientX;
      setWidth(Math.min(maxWidth, Math.max(minWidth, rawWidth)));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return { width, startResize };
}

const DEFAULT_DOCK_MIN_HEIGHT = 160;
const DEFAULT_DOCK_MAX_HEIGHT = 480;

// Same interaction pattern as usePanelResize above (drag a handle, track the
// cursor against the container's own fixed edge, clamp between min/max),
// just vertical — for the bottom timeline dock (App.tsx), whose fixed edge
// is the viewport's own bottom rather than a sibling panel's edge (Dana,
// 2026-10-14: "the timeline should be stretchable like the side panels are
// w a minimal height enforced").
export function useDockHeightResize(initialHeight: number, minHeight = DEFAULT_DOCK_MIN_HEIGHT, maxHeight = DEFAULT_DOCK_MAX_HEIGHT) {
  const [height, setHeight] = useState(initialHeight);

  function startResize(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    const fixedBottom = window.innerHeight;

    function onMove(moveEvent: MouseEvent) {
      const rawHeight = fixedBottom - moveEvent.clientY;
      setHeight(Math.min(maxHeight, Math.max(minHeight, rawHeight)));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return { height, startResize };
}
