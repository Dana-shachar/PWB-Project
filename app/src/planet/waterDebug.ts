// TEMP debug: draws one ingredient of the water color at a time, to find what makes it look wrong. Remove when done.
export const WATER_DEBUG_OPTIONS = [
  { value: '0', label: 'Off' },
  { value: '1', label: 'Depth (black shore, white deepest)' },
  { value: '2', label: 'Light getting through' },
  { value: '3', label: 'Seabed share' },
  { value: '4', label: 'Sea color (planet)' },
  { value: '5', label: 'Far smoothing (planet)' },
  { value: '6', label: 'Foam (planet)' },
  { value: '7', label: 'Whitecaps (planet)' },
];

export let waterDebugMode = 0;

export function setWaterDebugMode(mode: number): void {
  waterDebugMode = mode;
}
