// Which rivers to draw from where the camera is: none from afar, large ones first, smaller ones closer in.
// Distances and flows inferred, TUNABLE.
const RIVER_MAX_VIEW_ALTITUDE = 0.5; // above the ground, as a share of the radius
const RIVER_FAR_MIN_FLOW = 4096; // nodes draining through a river at that altitude
const RIVER_NEAR_MIN_FLOW = 16; // below every liquid's own limit, so that limit decides
const RIVER_VIEW_MARGIN = 0.1; // radians past the horizon, so rivers don't pop in at its edge

export interface RiverQuery {
  directionX: number;
  directionY: number;
  directionZ: number;
  cosAngle: number;
  minFlow: number;
}

// cameraX..Z are in the planet's own frame, so the spin never moves the rivers. null means draw none.
export function riverQueryForCamera(cameraX: number, cameraY: number, cameraZ: number, radius: number): RiverQuery | null {
  const distance = Math.hypot(cameraX, cameraY, cameraZ);
  const altitude = distance / radius - 1;
  if (altitude > RIVER_MAX_VIEW_ALTITUDE || distance === 0) return null;
  const share = Math.max(0, altitude) / RIVER_MAX_VIEW_ALTITUDE;
  const horizon = Math.acos(radius / Math.max(distance, radius));
  return {
    directionX: cameraX / distance,
    directionY: cameraY / distance,
    directionZ: cameraZ / distance,
    cosAngle: Math.cos(Math.min(Math.PI, horizon + RIVER_VIEW_MARGIN)),
    minFlow: Math.max(RIVER_NEAR_MIN_FLOW, RIVER_FAR_MIN_FLOW * share * share),
  };
}

export function riverQueriesMatch(first: RiverQuery | null, second: RiverQuery | null): boolean {
  if (!first || !second) return first === second;
  const directionMatch = first.directionX * second.directionX + first.directionY * second.directionY + first.directionZ * second.directionZ > 0.9995;
  return directionMatch && Math.abs(first.minFlow - second.minFlow) < first.minFlow * 0.1 && Math.abs(first.cosAngle - second.cosAngle) < 0.002;
}
