import { useEffect, useRef, type RefObject } from 'react';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';
import { HEIGHTMAP_WIDTH, HEIGHTMAP_HEIGHT, type NoiseLayer, type StrokeRecord } from './heightmap';

interface MapViewProps {
  layers: NoiseLayer[];
  selectedLayerId: string;
  brushRadiusPx: number; // pixels of the actual texture (HEIGHTMAP_WIDTH), not this canvas's displayed size
  brushValue: number; // -1 (erase/black) .. 1 (paint/white), from the B&W brush slider
  feather: number; // 0=hard edge, 1=fully soft — a fraction of brushRadiusPx (Photoshop-style Hardness); never changes brush size
  sceneHandleRef: RefObject<SceneCanvasHandle | null>;
  onStrokeComplete: (record: StrokeRecord) => void; // logs the finished stroke for save/undo — see ROADMAP.md, Stage 06
  paintVersion: number; // bumped by App.tsx when the paint texture changes for a reason `layers` alone wouldn't tell us (currently: undo)
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
  onStrokeComplete,
  paintVersion,
}: MapViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function refreshDisplay() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const imageData = sceneHandleRef.current?.getPreviewImageData();
    if (!canvas || !ctx || !imageData) return;
    ctx.putImageData(imageData, 0, 0);
  }

  // Redraws whenever the layer stack changes — relies on SceneCanvas's own
  // layers-effect having already re-rendered the shared texture first,
  // which holds because it mounts earlier in App.tsx's JSX than this does
  // — and whenever paintVersion changes, for texture updates that don't
  // change `layers` itself (currently: undo — see App.tsx's undo()).
  useEffect(() => {
    refreshDisplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshDisplay reads refs, not props/state
  }, [layers, paintVersion]);

  function uvFromPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height; // flip: canvas Y-down, UV Y-up
    return { x, y };
  }

  // Adds one point to the active stroke — the shader connects it to the
  // previous point as part of the whole stroke's path, so no manual gap-
  // filling between pointermove events is needed here. See
  // shaders/strokePath.frag.glsl and ISSUES.md, 2026-09-22.
  function paintStrokeTo(uv: { x: number; y: number }) {
    const radiusUV = brushRadiusPx / HEIGHTMAP_WIDTH; // px is relative to the texture, not the display size
    sceneHandleRef.current?.paintStroke(selectedLayerId, uv, radiusUV, brushValue, feather);
    refreshDisplay();
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const uv = uvFromPointer(event);
    sceneHandleRef.current?.beginStroke(selectedLayerId, uv);
    paintStrokeTo(uv);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.buttons !== 1) return; // only while the primary button is held
    paintStrokeTo(uvFromPointer(event));
  }

  function handlePointerUp() {
    const record = sceneHandleRef.current?.endStroke();
    if (record) onStrokeComplete(record);
  }

  return (
    <canvas
      ref={canvasRef}
      width={HEIGHTMAP_WIDTH}
      height={HEIGHTMAP_HEIGHT}
      // Fills its container's width, height derived from the real 2:1
      // texture aspect ratio — not a fixed square (Dana, 2026-09-30: "the
      // 2d canvas gets cut... should fill the width of available panel").
      // A fixed square both clipped at narrow widths and stretched/
      // distorted the 2:1 image regardless of width.
      style={{ width: '100%', height: 'auto', aspectRatio: `${HEIGHTMAP_WIDTH} / ${HEIGHTMAP_HEIGHT}`, display: 'block', cursor: 'crosshair' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}
