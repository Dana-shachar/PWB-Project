import { useRef, useState } from 'react';

// The visible window of a timeline as shares of its whole span, driven three ways that never disagree: the zoom
// buttons, scrolling over the ruler, and the navigator (After Effects' scrollbar that changes size). Same behavior as
// erosion's timeline.
const MIN_SPAN_FRACTION = 1 / 64;
const ZOOM_STEP = 1.4;

export function useTimelineView() {
  const [spanFraction, setSpanFraction] = useState(1);
  const [startFraction, setStartFraction] = useState(0);
  const navigatorRef = useRef<HTMLDivElement>(null);

  function setView(nextSpan: number, centerFraction: number) {
    const clampedSpan = Math.min(1, Math.max(MIN_SPAN_FRACTION, nextSpan));
    setSpanFraction(clampedSpan);
    setStartFraction(Math.min(1 - clampedSpan, Math.max(0, centerFraction - clampedSpan / 2)));
  }

  const zoomBy = (factor: number) => setView(spanFraction / factor, startFraction + spanFraction / 2);
  // The zoom slider's 0 to 1, on a log scale from the whole span to the closest zoom, about the window's center.
  const zoomLevel = Math.log(spanFraction) / Math.log(MIN_SPAN_FRACTION);
  const zoomTo = (level: number) => setView(MIN_SPAN_FRACTION ** level, startFraction + spanFraction / 2);
  const reset = () => setView(1, 0.5);
  const zoomIn = () => zoomBy(ZOOM_STEP);
  const zoomOut = () => zoomBy(1 / ZOOM_STEP);

  function handleWheel(event: React.WheelEvent) {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
  }

  function navigatorFraction(clientX: number): number {
    const rect = navigatorRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function drag(onMove: (event: MouseEvent) => void) {
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Dragging the handle's body pans the window.
  function handleNavigatorPan(event: React.MouseEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const fromX = event.clientX;
    const fromStart = startFraction;
    drag((moveEvent) => {
      const rect = navigatorRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      setStartFraction(Math.min(1 - spanFraction, Math.max(0, fromStart + (moveEvent.clientX - fromX) / rect.width)));
    });
  }

  // Dragging either edge resizes the window, the same zoom the buttons and scrolling drive.
  function handleNavigatorEdge(edge: 'start' | 'end') {
    return (event: React.MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      drag((moveEvent) => {
        const fraction = navigatorFraction(moveEvent.clientX);
        if (edge === 'start') {
          const end = startFraction + spanFraction;
          const nextStart = Math.min(end - MIN_SPAN_FRACTION, Math.max(0, fraction));
          setStartFraction(nextStart);
          setSpanFraction(end - nextStart);
        } else {
          setSpanFraction(Math.min(1 - startFraction, Math.max(MIN_SPAN_FRACTION, fraction - startFraction)));
        }
      });
    };
  }

  return { spanFraction, startFraction, navigatorRef, zoomLevel, zoomTo, zoomIn, zoomOut, reset, handleWheel, handleNavigatorPan, handleNavigatorEdge };
}
