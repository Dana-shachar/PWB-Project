// Shared water look for the planet's ocean and the chunk's water plane, so both views color the same depth the same way.
// Needs terrain.glsl first (MAX_COLOR_STOPS, terrainRampColor).

// Water reflects 2% of light head-on: ((1.33 - 1) / (1.33 + 1))^2 for water's refractive index of 1.33.
const float WATER_F0 = 0.02;

// Schlick's approximation of the Fresnel reflectance: how much light the surface reflects at this viewing angle.
float waterFresnel(vec3 normal, vec3 viewDir) {
  float cosTheta = clamp(dot(normal, viewDir), 0.0, 1.0);
  return WATER_F0 + (1.0 - WATER_F0) * pow(1.0 - cosTheta, 5.0);
}

// Light through water fades by Beer-Lambert, exp(-depth / clarity). depthShare is the depth as a share of the
// deepest water (0 at the shore), so it is the same number in both views.
float waterTransmittance(float depthShare, float clarity) {
  return exp(-max(depthShare, 0.0) / max(clarity, 0.001));
}

// Where a depth sits on the water ramp: spaced by light remaining, normalized so the deepest water is 1.
// Mirrors depthToRampPosition in planet/seaLevel.ts.
float waterRampPosition(float depthShare, float clarity) {
  float scale = max(clarity, 0.001);
  return (1.0 - exp(-clamp(depthShare, 0.0, 1.0) / scale)) / (1.0 - exp(-1.0 / scale));
}

// Per-channel absorption: the seabed seen through the water is filtered toward the water's own color, so even
// shallow water tints the ground (absorption-based water). Channels the water color lacks fade first.
vec3 waterFilter(float depthShare, float clarity, vec3 rampColor) {
  return exp(-(1.0 - rampColor) * max(depthShare, 0.0) / max(clarity, 0.001));
}

// What multiplies the lit seabed: tinted per channel and faded by depth, minus what the surface reflects.
vec3 waterSeabedFactor(float depthShare, float clarity, vec3 rampColor, float fresnel) {
  return waterFilter(depthShare, clarity, rampColor) * waterTransmittance(depthShare, clarity) * (1.0 - fresnel);
}

// The water's own light: its ramp color where the seabed has faded, plus the reflected sky.
vec3 waterOwnLight(float depthShare, float clarity, vec3 rampColor, float waterLight, float fresnel, vec3 skyColor) {
  return rampColor * waterLight * (1.0 - waterTransmittance(depthShare, clarity)) * (1.0 - fresnel) + skyColor * fresnel;
}

// The whole water color over a lit seabed: the two parts above always add up, so the shore shows the seabed and
// deep water only the ramp. The chunk draws the same two parts as a multiply pass and an add pass.
vec3 waterSurfaceColor(vec3 seabedLit, float depthShare, float clarity, vec3 rampColor, float waterLight, float fresnel, vec3 skyColor) {
  return seabedLit * waterSeabedFactor(depthShare, clarity, rampColor, fresnel) + waterOwnLight(depthShare, clarity, rampColor, waterLight, fresnel, skyColor);
}

// Shore foam: a soft band where the water is shallowest, the depth-difference foam of game water shaders (here the
// depth is already known). breakup (0..1, from the ripple texture) varies its strength. Width and look inferred, TUNABLE.
const vec3 FOAM_COLOR = vec3(0.95, 0.97, 1.0);
float waterFoam(float depthShare, float foamWidth, float breakup) {
  if (foamWidth <= 0.0) return 0.0;
  float band = 1.0 - smoothstep(0.0, foamWidth, max(depthShare, 0.0));
  return band * band * (0.4 + 0.6 * breakup);
}

// The sun's glint on water, its own strength so the land's Specular slider can't switch it off. Inferred, TUNABLE.
const float WATER_GLINT_STRENGTH = 0.8;
