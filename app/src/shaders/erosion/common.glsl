// Shared constants and edge handling for the erosion passes, prepended to
// each of them the same way noise.glsl is prepended to the heightmap shader.
// See erosion/erosionEngine.ts for the pass order these belong to.
//
// The grid works in cells: one texel is one cell, so the virtual pipes'
// length and cross-section are both 1 and gravity is the only constant
// carrying a real unit. Terrain height is converted into the same cell units
// when the state is seeded.

const float GRAVITY = 9.81;

// A ceiling on the tilt, not a floor. Capacity grows with slope, so without
// a cap a cliff asks to carry unlimited sediment and tears itself into
// spikes within a few steps. Verified against the reference implementation,
// which caps at this same value. See REFERENCES.md.
const float MAX_TILT = 0.05;

// The depth at which water carries its full load. Shallower water carries
// proportionally less, down to nothing on dry ground, which is the other
// half of what keeps capacity bounded: velocity is flow divided by depth, so
// without this a nearly dry cell reports an enormous speed and erodes far
// more rock than it holds. Matches REFERENCE_DEPTH in erosionEngine.ts,
// which is the same idea used for the solver's stability bound.
const float MAX_EROSION_DEPTH = 1.0;

// Below this there is effectively no water, so velocity and capacity are
// taken as zero rather than dividing by it.
const float MIN_WATER = 1e-5;

bool offGrid(vec2 uv) {
  return uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0;
}

// Water leaves the patch at its edge rather than piling against a wall. The
// caller decides what lies outside by passing `outsideSurface`: bare ground
// at the local terrain height on dry land, or the sea's own level where
// there is sea, so an ocean does not quietly drain off the edge of the
// patch. A closed edge instead pools water in a ring, which is wrong on a
// piece of a planet.
float neighborSurface(sampler2D state, vec2 uv, float outsideSurface) {
  if (offGrid(uv)) return outsideSurface;
  vec4 neighbor = texture2D(state, uv);
  return neighbor.r + neighbor.g;
}

// Inflow from one neighbor is that neighbor's outflow aimed back at this
// cell. A neighbor outside the grid sends nothing, which is the other half
// of the open edge: water leaves and none arrives.
float inflowFrom(sampler2D flux, vec2 uv, int pipe) {
  if (offGrid(uv)) return 0.0;
  vec4 neighbor = texture2D(flux, uv);
  if (pipe == 0) return neighbor.r; // its left pipe
  if (pipe == 1) return neighbor.g; // its right pipe
  if (pipe == 2) return neighbor.b; // its up pipe
  return neighbor.a;                // its down pipe
}
