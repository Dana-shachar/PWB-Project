// The time ruler shared by erosion's timeline and the World Clock: nice-number tick spacing and a unit that follows
// the zoom ([S26], Heckbert's nice numbers and d3's unit ladder, REFERENCES.md).

export type RulerUnit = 'years' | 'thousand' | 'million';
export type TimelineUnit = 'auto' | RulerUnit;

// Snaps to 1, 2, 5 or 10 times a power of ten, so ticks land on readable values at any zoom.
export function niceNumber(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

export function unitForMagnitude(years: number): RulerUnit {
  if (years >= 1_000_000) return 'million';
  if (years >= 1_000) return 'thousand';
  return 'years';
}

export function unitLabel(unit: RulerUnit): string {
  if (unit === 'million') return 'Million years';
  if (unit === 'thousand') return 'Thousand years';
  return 'Years';
}

// A tick's full value with its unit, the geology convention for durations (yr, kyr, Myr), so every tick reads alone.
export function formatTickValue(years: number, unit: RulerUnit): string {
  if (unit === 'million') return `${Math.round((years / 1_000_000) * 100) / 100} Myr`;
  if (unit === 'thousand') return `${Math.round((years / 1_000) * 10) / 10} kyr`;
  return `${Math.round(years).toLocaleString()} yr`;
}

// The "current / total" readout's short form, "M" only once the full number gets unwieldy (Dana, 2026-10-14).
export function formatCompactYears(years: number): string {
  if (years >= 1_000_000) return `${Math.round((years / 1_000_000) * 10) / 10}M`;
  return Math.round(years).toLocaleString();
}

// About 8 ticks across the visible range, in the override unit or the one its length calls for.
export function rulerTicks(startYear: number, visibleYears: number, unitOverride: TimelineUnit): { ticks: number[]; unit: RulerUnit } {
  const visible = Math.max(1, visibleYears);
  const spacing = niceNumber(visible / 8);
  const unit = unitOverride === 'auto' ? unitForMagnitude(visible) : unitOverride;
  const endYear = startYear + visible;
  const ticks: number[] = [];
  for (let year = Math.floor(startYear / spacing) * spacing; year <= endYear + spacing * 0.001; year += spacing) {
    if (year >= -spacing * 0.001) ticks.push(year);
  }
  return { ticks, unit };
}
