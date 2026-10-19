// Flat line-art icons replacing emoji button glyphs (Dana, 2026-10-13: emoji
// "is just a lazy solution... it cannot be a part of the design"). Each is a
// self-contained inline SVG, stroke/fill set to currentColor so it inherits
// whatever color the surrounding button already uses, no new color tokens.
// See ui-design skill's "plain glyph, no box chrome" convention.

interface IconProps {
  className?: string;
}

const ICON_SIZE = 16;

export function DiceIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      aria-hidden="true"
    >
      <rect x={2} y={2} width={12} height={12} rx={2} />
      <circle cx={5.3} cy={5.3} r={0.9} fill="currentColor" stroke="none" />
      <circle cx={10.7} cy={5.3} r={0.9} fill="currentColor" stroke="none" />
      <circle cx={8} cy={8} r={0.9} fill="currentColor" stroke="none" />
      <circle cx={5.3} cy={10.7} r={0.9} fill="currentColor" stroke="none" />
      <circle cx={10.7} cy={10.7} r={0.9} fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PaletteIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      aria-hidden="true"
    >
      <path d="M8 2.3c-3.3 0-6 2.4-6 5.6 0 2.3 1.6 3.3 2.8 3.3.6 0 .9-.3.9-.8 0-.4-.3-.6-.3-1.1 0-.5.4-.9 1-.9h1.8c1.9 0 3.8-1.3 3.8-3.7 0-1.6-1.3-2.4-4-2.4Z" />
      <circle cx={5.4} cy={6.4} r={0.7} fill="currentColor" stroke="none" />
      <circle cx={8} cy={5} r={0.7} fill="currentColor" stroke="none" />
      <circle cx={10.3} cy={6.6} r={0.7} fill="currentColor" stroke="none" />
    </svg>
  );
}

export function EyeIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      aria-hidden="true"
    >
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx={8} cy={8} r={2} />
    </svg>
  );
}

// Transport icons (erosion/ErosionTimeline.tsx) — standard media-player
// glyphs, Play/Pause distinct from Run/Reset: Play/Pause animate the
// playhead through an already-computed run, Run/Reset drive the actual
// simulation (Dana, 2026-10-14 — these are not the same action).
export function PlayIcon({ className }: IconProps) {
  return (
    <svg className={className} width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4 2.5v11l10-5.5-10-5.5Z" />
    </svg>
  );
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg className={className} width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x={3.5} y={2.5} width={3} height={11} rx={0.5} />
      <rect x={9.5} y={2.5} width={3} height={11} rx={0.5} />
    </svg>
  );
}

// A terrain profile, not a triangle — the circled-triangle version read as
// just another Play variant (Dana, 2026-10-14: "the icon isnt clear"). Run
// recomputes the simulation; this reads as "the terrain itself," distinct
// from Play/Pause's playback glyphs by shape, not just by a circle around it.
export function RunIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 12 5 6l2.3 2.7L10 4l4.5 8Z" />
    </svg>
  );
}

export function ResetIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      aria-hidden="true"
    >
      <path d="M12.5 8A4.5 4.5 0 1 1 10.8 4.4" />
      <path d="M12.8 2.2v3.3h-3.3" />
    </svg>
  );
}
