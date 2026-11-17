// A tree's trunk or leaves (trees/treeLook.ts). Leaves bend their normals outward from the canopy's center, so the
// crown shades as one soft mass (stylized foliage's spherical normals, BIOME-PLAN.md Trees).
uniform float uIsLeaf;
uniform vec3 uCanopyCenter; // local
uniform float uNormalBend; // 0 the part's own normal, 1 the canopy sphere's
uniform float uTime;
uniform float uWind; // the Atmosphere's Wind as a share of force 12's speed
uniform vec2 uWindDirection; // across the ground (x, z)
uniform float uBendHeight; // 1 / the tree's height
uniform float uMainBend; // the tip's sway at full wind, this tree's own stiffness included
uniform float uMaxLean; // the most the tip may move, however strong the wind (Crysis: limit the deformation)
uniform float uLeafEdge; // leaf edge flutter at full wind
uniform float uLeafBob; // whole-leaf bob at full wind
attribute float aShade;
attribute float aPhase; // leaves: per-leaf wind phase (Crysis's green channel); trunk has none
attribute float aAlong; // leaf parts: base 0 to tip 1 (trees/leafParts.ts); trunk has none, reads 0
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vLocal;
varying float vShade;
varying float vAlong;

// Crysis's waves (GPU Gems 3 ch. 16, listing 16-1): triangle waves smoothed by a cubic.
const float VERTEX_PHASE = 0.03; // how fast the flutter's phase changes along a leaf, per tree unit. TUNABLE
const float GUST_PEAK = 1.5; // a full gust at force 12 sways this many times the calm sway; weaker winds, less. TUNABLE
const float DETAIL_TIME = 0.5; // the leaf waves' speed against Crysis's, slower so leaves sway instead of flicker. TUNABLE

vec4 smoothCurve(vec4 x) { return x * x * (3.0 - 2.0 * x); }
vec4 triangleWave(vec4 x) { return abs(fract(x + 0.5) * 2.0 - 1.0); }
vec4 smoothTriangleWave(vec4 x) { return smoothCurve(triangleWave(x)); }

// Gusts (the wind's own variation, Crysis's CPU side; SpeedTree's gust settings): two slow smoothed waves at unrelated
// speeds, offset by the tree's position so a gust passes across trees; calm near 1, up to 1 + GUST_PEAK * wind.
float gustFactor(vec3 origin) {
  float offset = dot(origin.xz, uWindDirection) * 0.02;
  vec4 waves = smoothTriangleWave(vec4(uTime * 0.13 - offset, uTime * 0.047 - offset + 0.37, 0.0, 0.0));
  float gust = waves.x * waves.y; // high only when both waves are high: short bursts between calm stretches
  return 1.0 + GUST_PEAK * uWind * gust * gust;
}

void main() {
  vec3 objectNormal = normal;
  vec3 bent = position;
  float gust = gustFactor((modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
  if (uIsLeaf > 0.5) {
    // Detail bending (listing 16-2): edges flutter along the normal, leaves bob up and down; the base-to-tip share
    // stands in for Crysis's painted edge and leaf stiffness, so bases hold still.
    // Crysis's phases are in meters with a small detail phase; in tree units the raw product made every vertex shake on
    // its own, so the vertex term is scaled down (VERTEX_PHASE) and a leaf moves as one, a slow wave toward its tip.
    float objectPhase = fract(dot((modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, vec3(0.13)));
    float branchPhase = aPhase * 6.2832 + objectPhase;
    float vertexPhase = branchPhase + dot(position, vec3(VERTEX_PHASE));
    vec2 wavesIn = uTime * DETAIL_TIME + vec2(vertexPhase, branchPhase);
    vec4 waves = (fract(wavesIn.xxyy * vec4(1.975, 0.793, 0.375, 0.193)) * 2.0 - 1.0) * (0.5 + uWind);
    waves = smoothTriangleWave(waves) * 2.0 - 1.0; // centered: leaves swing both ways around rest, never only one way
    vec2 wavesSum = (waves.xz + waves.yw) * 0.5;
    // Bends over a part's first 40%, then moves rigidly, so discs and blades keep their shape instead of stretching.
    float atten = smoothstep(0.0, 0.4, aAlong);
    // Crysis moves edges along each vertex's normal (flat leaf cards); our parts are tubes closing to a point, so a
    // per-leaf direction keeps every vertex of a leaf moving together and its tip sharp.
    vec2 leafSide = vec2(cos(aPhase * 6.2832), sin(aPhase * 6.2832));
    bent.xz += wavesSum.x * atten * uLeafEdge * uWind * gust * leafSide;
    bent.y += wavesSum.y * atten * uLeafBob * uWind * gust;
  }
  // Main bending (listing 16-3): the whole tree leans along the wind, more with height, then rescaled to its distance
  // from the base so the motion stays a limited swing.
  float bend = bent.y * uBendHeight + 1.0;
  bend *= bend;
  bend = bend * bend - bend;
  float length0 = length(bent);
  float lean = min(uMainBend * uWind * gust, uMaxLean);
  bent.xz += uWindDirection * (lean / 12.0) * bend;
  bent = normalize(bent + vec3(0.0, 1e-6, 0.0)) * length0;
  if (uIsLeaf > 0.5) {
    vec3 sphereNormal = normalize(position - uCanopyCenter + vec3(0.0, 1e-4, 0.0));
    objectNormal = normalize(mix(normal, sphereNormal, uNormalBend));
  }
  vec4 world = modelMatrix * vec4(bent, 1.0);
  vWorldPosition = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
  vLocal = position;
  vShade = aShade;
  vAlong = aAlong;
  gl_Position = projectionMatrix * viewMatrix * world;
}
