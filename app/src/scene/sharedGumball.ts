import { useEffect, useRef, useState, type RefObject } from 'react';
import { Gumball, type GumballTarget } from './Gumball';
import type { SceneCanvasHandle } from './SceneCanvas';
import type { LandChunkCanvasHandle } from '../voxel/LandChunkCanvas';
import type { ViewMode } from '../voxel/landChunk';

export type ViewportPane = 'planet' | 'landChunk';

// The single shared gumball driving whichever viewport pane(s) are
// currently selected — click a pane to select it exclusively, shift+click
// the other pane to add it too (both cameras move together from the same
// controls). One DOM widget, mounted once into mountRef's container and
// retargeted (never recreated or duplicated) as the selection changes —
// replaces one-gumball-per-canvas. See ISSUES.md, 2026-09-23.
export function useSharedGumball(
  sceneHandleRef: RefObject<SceneCanvasHandle | null>,
  landChunkHandleRef: RefObject<LandChunkCanvasHandle | null>,
  viewMode: ViewMode,
) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gumballRef = useRef<Gumball | null>(null);
  const [selectedPanes, setSelectedPanes] = useState<ViewportPane[]>(['planet']);

  function handlePaneClick(pane: ViewportPane, event: { shiftKey: boolean }) {
    setSelectedPanes((previous) => {
      if (!event.shiftKey) return [pane];
      if (previous.includes(pane)) {
        const next = previous.filter((selected) => selected !== pane);
        return next.length > 0 ? next : previous; // never empty
      }
      return [...previous, pane];
    });
  }

  // Drops "landChunk" from the selection once its pane stops being
  // rendered (view mode switched away from it), so the gumball never tries
  // to target a camera that no longer exists.
  useEffect(() => {
    if (viewMode !== 'planet') return;
    setSelectedPanes((previous) => {
      const withoutChunk = previous.filter((pane) => pane !== 'landChunk');
      return withoutChunk.length > 0 ? withoutChunk : ['planet'];
    });
  }, [viewMode]);

  // Mounts the single Gumball instance once, targeting the planet (default
  // selection) as soon as its camera exists.
  useEffect(() => {
    const mountElement = mountRef.current;
    const initialTarget = sceneHandleRef.current?.getGumballTarget();
    if (!mountElement || !initialTarget) return;
    const gumball = new Gumball([initialTarget], mountElement);
    gumballRef.current = gumball;

    let animationFrameId: number;
    function animate() {
      gumball.update();
      animationFrameId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      gumball.dispose();
      gumballRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/teardown once; retargeting is the effect below, sceneHandleRef is a stable ref
  }, []);

  // Retargets (never recreates) whenever the selection changes.
  useEffect(() => {
    const gumball = gumballRef.current;
    if (!gumball) return;
    const targets = selectedPanes
      .map((pane) => (pane === 'planet' ? sceneHandleRef.current?.getGumballTarget() : landChunkHandleRef.current?.getGumballTarget()))
      .filter((target): target is GumballTarget => target != null);
    if (targets.length > 0) gumball.setTargets(targets);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sceneHandleRef/landChunkHandleRef are stable refs
  }, [selectedPanes]);

  return { mountRef, selectedPanes, handlePaneClick };
}
