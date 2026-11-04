import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import * as THREE from 'three';
import type { SceneCanvasHandle } from '../scene/SceneCanvas';
import { cubeFaceCoord, cubeFacePoint, type CubeFace } from '../planet/cubeFace';
import { directionToFaceCoord, MAX_PATCH_DEPTH, type TerrainPatch } from '../planet/patch';

// Selection mode: drag a square on the planet from one corner and the land chunk shows that area, with Size (km) set
// to the square's width along the surface. The square lies on one cube face, the way the chunk system describes an
// area (face plus a rectangle), and is drawn on the globe's curve (scene/areaOutline.ts). The usual marquee pattern
// of World Machine's extents and Roblox's Select tool (REFERENCES.md).

export const AREA_SIZE_MIN_KM = 4;
export const AREA_SIZE_MAX_KM = 4000;
const LABEL_OFFSET_PX = 12;

// Where a direction from the planet's center crosses `face`'s plane, in that face's coordinates; null behind it.
function coordOnFace(face: CubeFace, direction: THREE.Vector3): THREE.Vector2 | null {
  const axis = cubeFacePoint(face, 0, 0);
  const along = direction.dot(axis);
  if (along <= 1e-6) return null;
  return cubeFaceCoord(face, direction.clone().divideScalar(along));
}

// A square patch from its lower corner and side, kept inside the face; depth from its size, as halving a face gives.
function squarePatch(face: CubeFace, minX: number, minY: number, side: number): TerrainPatch {
  const size = Math.min(2, Math.max(1e-6, side));
  const clampedX = Math.min(1 - size, Math.max(-1, minX));
  const clampedY = Math.min(1 - size, Math.max(-1, minY));
  const depth = Math.min(MAX_PATCH_DEPTH, Math.max(0, Math.round(Math.log2(2 / size))));
  return { face, min: new THREE.Vector2(clampedX, clampedY), max: new THREE.Vector2(clampedX + size, clampedY + size), depth };
}

// The square's width along the surface, across its middle.
export function squareSizeKm(patch: TerrainPatch, radiusKm: number): number {
  const midY = (patch.min.y + patch.max.y) / 2;
  const left = cubeFacePoint(patch.face, patch.min.x, midY).normalize();
  const right = cubeFacePoint(patch.face, patch.max.x, midY).normalize();
  return left.angleTo(right) * radiusKm;
}

// The square from the press point to the drag point: the press is one corner, the longer side of the drag sets the size.
export function squareFromDrag(start: THREE.Vector3, current: THREE.Vector3): TerrainPatch {
  const { face, coord: corner } = directionToFaceCoord(start);
  const end = coordOnFace(face, current) ?? corner;
  const deltaX = end.x - corner.x;
  const deltaY = end.y - corner.y;
  // Stops at the face's edge, so the press stays a corner: past it the drag's projection runs far off the face.
  const roomX = deltaX >= 0 ? 1 - corner.x : corner.x + 1;
  const roomY = deltaY >= 0 ? 1 - corner.y : corner.y + 1;
  const side = Math.min(Math.max(Math.abs(deltaX), Math.abs(deltaY)), roomX, roomY);
  return squarePatch(face, deltaX >= 0 ? corner.x : corner.x - side, deltaY >= 0 ? corner.y : corner.y - side, side);
}

// A square of sizeKm centered on a face point: the side found by halving the search, since the width grows with it.
export function squareAroundCenter(face: CubeFace, center: THREE.Vector2, sizeKm: number, radiusKm: number): TerrainPatch {
  const widthKm = (side: number) =>
    cubeFacePoint(face, center.x - side / 2, center.y).normalize().angleTo(cubeFacePoint(face, center.x + side / 2, center.y).normalize()) * radiusKm;
  let low = 1e-6;
  let high = 2;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (widthKm(mid) < sizeKm) low = mid;
    else high = mid;
  }
  const side = (low + high) / 2;
  return squarePatch(face, center.x - side / 2, center.y - side / 2, side);
}

interface AreaTarget {
  patch: TerrainPatch;
  setPatch: (patch: TerrainPatch) => void;
  chunkSize: number;
  setChunkSize: (size: number) => void;
}

export function useAreaSelect(sceneHandleRef: RefObject<SceneCanvasHandle | null>, area: AreaTarget, radiusKm: number) {
  const [selecting, setSelecting] = useState(false);
  const [sizeLabel, setSizeLabel] = useState<{ x: number; y: number; km: number } | null>(null);
  const [frameVersion, setFrameVersion] = useState(0); // steps with each drawn square, so the chunk's camera frames it
  const startRef = useRef<THREE.Vector3 | null>(null);
  const draftRef = useRef<TerrainPatch | null>(null);
  const areaRef = useRef(area);
  areaRef.current = area;

  // While selecting, a drag draws instead of turning the camera.
  useEffect(() => {
    sceneHandleRef.current?.setOrbitEnabled(!selecting);
  }, [sceneHandleRef, selecting]);

  // Esc leaves selection mode, dropping a drag in progress and keeping the current area.
  useEffect(() => {
    if (!selecting) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      startRef.current = null;
      draftRef.current = null;
      setSizeLabel(null);
      sceneHandleRef.current?.setAreaOutline(frameVersion > 0 ? areaRef.current.patch : null);
      setSelecting(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sceneHandleRef, selecting, frameVersion]);

  // The chunk's area is outlined on the planet once a square is drawn, not on load.
  useEffect(() => {
    sceneHandleRef.current?.setAreaOutline(frameVersion > 0 ? area.patch : null);
  }, [sceneHandleRef, area.patch, frameVersion]);

  // On load and on a radius change: the area becomes a square of Size (km) around its current center.
  useEffect(() => {
    const { patch, chunkSize, setPatch } = areaRef.current;
    const center = patch.min.clone().add(patch.max).multiplyScalar(0.5);
    setPatch(squareAroundCenter(patch.face, center, chunkSize, radiusKm));
  }, [radiusKm]);

  // The Size (km) slider: the same center, a new size.
  function resizeArea(sizeKm: number) {
    const { patch, setPatch, setChunkSize } = areaRef.current;
    setChunkSize(sizeKm);
    const center = patch.min.clone().add(patch.max).multiplyScalar(0.5);
    setPatch(squareAroundCenter(patch.face, center, sizeKm, radiusKm));
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (!selecting) return;
    const direction = sceneHandleRef.current?.pickPointAt(event.clientX, event.clientY);
    if (!direction) return;
    startRef.current = direction;
    draftRef.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const start = startRef.current;
    if (!selecting || !start) return;
    const direction = sceneHandleRef.current?.pickPointAt(event.clientX, event.clientY);
    if (!direction) return;
    const draft = squareFromDrag(start, direction);
    draftRef.current = draft;
    sceneHandleRef.current?.setAreaOutline(draft);
    setSizeLabel({ x: event.clientX + LABEL_OFFSET_PX, y: event.clientY + LABEL_OFFSET_PX, km: squareSizeKm(draft, radiusKm) });
  }

  function onPointerUp() {
    const draft = draftRef.current;
    startRef.current = null;
    draftRef.current = null;
    setSizeLabel(null);
    if (!draft) return;
    setSelecting(false);
    setFrameVersion((version) => version + 1);
    const drawnKm = squareSizeKm(draft, radiusKm);
    const sizeKm = Math.min(AREA_SIZE_MAX_KM, Math.max(AREA_SIZE_MIN_KM, Math.round(drawnKm)));
    areaRef.current.setChunkSize(sizeKm);
    // Past the size limits, the square is redrawn at the limit around the same center.
    const center = draft.min.clone().add(draft.max).multiplyScalar(0.5);
    areaRef.current.setPatch(Math.abs(sizeKm - drawnKm) > 1 ? squareAroundCenter(draft.face, center, sizeKm, radiusKm) : draft);
  }

  return { selecting, toggleSelecting: () => setSelecting((value) => !value), sizeLabel, frameVersion, resizeArea, onPointerDown, onPointerMove, onPointerUp };
}
