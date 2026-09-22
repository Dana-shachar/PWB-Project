import { useEffect, useRef, type RefObject } from 'react';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';
import { HEIGHTMAP_WIDTH, type NoiseLayer } from './heightmap';

interface MapViewProps {
  layers: NoiseLayer[];
  selectedLayerId: string;
  brushRadiusPx: number; // pixels of the actual texture (HEIGHTMAP_WIDTH), not this canvas's displayed size
  brushValue: number; // -1 (erase/black) .. 1 (paint/white), from the B&W brush slider
  feather: number; // 0=hard edge, 1=fully soft — a fraction of brushRadiusPx (Photoshop-style Hardness); never changes brush size
  sceneHandleRef: RefObject<SceneCanvasHandle | null>;
  sizePx?: number; // CSS display size — NoisePanel passes a larger value when expanded
}

// The flat 2D preview of the heightmap. No WebGL context of its own — a
// plain 2D <canvas> that mirrors the shared HeightmapPipeline owned by
// SceneCanvas (see ISSUES.md, 2026-09-15, for why one renderer has to be
// the sole owner) and captures paint pointer input, forwarding strokes to
// that same pipeline via sceneHandleRef.
export function MapView({
  layers,
  selectedLayerId,
  brushRadiusPx,
  brushValue,
  feather,
  sceneHandleRef,
  sizePx = 300,
}: MapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPaintUvRef = useRef<{ x: number; y: number } | null>(null); // last dab's UV, for stroke interpolation below

  function refreshDisplay() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const imageData = sceneHandleRef.current?.getPreviewImageData();
    if (!canvas || !ctx || !imageData) return;
    ctx.putImageData(imageData, 0, 0);
  }

  // Redraws whenever the layer stack changes — relies on SceneCanvas's own
  // layers-effect having already re-rendered the shared texture first,
  // which holds because it mounts earlier in App.tsx's JSX than this does.
  useEffect(() => {
    refreshDisplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshDisplay reads refs, not props/state
  }, [layers]);

  function uvFromPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height; // flip: canvas Y-down, UV Y-up
    return { x, y };
  }

  function paintAt(uv: { x: number; y: number }, radiusUV: number) {
    sceneHandleRef.current?.paintStroke(selectedLayerId, uv, radiusUV, brushValue, feather);
  }

  // Dabs one stroke segment, filling in extra dabs between the last painted
  // point and this one so fast drags don't leave gaps between discrete
  // pointermove events — standard technique in paint tools.
  function paintStrokeTo(uv: { x: number; y: number }) {
    const radiusUV = brushRadiusPx / HEIGHTMAP_WIDTH; // px is relative to the texture, not the display size
    const last = lastPaintUvRef.current;
    if (last) {
      const dist = Math.hypot(uv.x - last.x, uv.y - last.y);
      const spacing = radiusUV * 0.35; // dab spacing as a fraction of brush radius, for smooth overlap
      const steps = Math.ceil(dist / spacing);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        paintAt({ x: last.x + (uv.x - last.x) * t, y: last.y + (uv.y - last.y) * t }, radiusUV);
      }
    }
    paintAt(uv, radiusUV);
    lastPaintUvRef.current = uv;
    refreshDisplay();
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPaintUvRef.current = null; // new stroke — don't interpolate from a previous stroke's endpoint
    paintStrokeTo(uvFromPointer(event));
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.buttons !== 1) return; // only while the primary button is held
    paintStrokeTo(uvFromPointer(event));
  }

  return (
    <canvas
      ref={canvasRef}
      width={1024}
      height={512}
      style={{ width: sizePx, height: sizePx, display: 'block', cursor: 'crosshair' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    />
  );
}
