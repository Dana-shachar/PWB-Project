/*
 * "Seascape" by Alexander Alekseev aka TDM - 2014
 * License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
 * Contact: tdmaav@gmail.com
 *
 * This file is a port of Seascape (shadertoy.com/view/Ms2SD1, copied from Fuchsia's embedded copy) and is shared
 * under the same CC BY-NC-SA 3.0 license. Changes: SEA_TIME reads a uniform instead of iGlobalTime; map_detailed
 * stops after uSeaIterations octaves (the "Wave detail" setting); getSeaColor takes its base, water and sky colors
 * and its sun highlight's sharpness as arguments (seaColor), so the water ramp can recolor it and far water can
 * widen the highlight; hash is the repo's sine-free hash (shaders/noise.glsl's hash1), since the sine hash banded
 * into stripes at kilometer-scale coordinates; diffuse and specular are renamed seaDiffuse and seaSpecular, since
 * the planet shader already has variables by those names; each wave octave drifts in its own direction and speed
 * instead of all along one diagonal; the octave loop lives in sea_octaves, band-limited by the pixel footprint
 * (Quilez); getNormal reads sea_height, which adds currents and a slow bend (see below); and seaColor scales its sky
 * reflection and sun highlight by the Reflection and Shine settings. The rest is the original. Used by voxel/chunkWater.ts and the planet.
 */

uniform float uSeaTime; // seconds
uniform float uSeaIterations; // 1 to ITER_FRAGMENT
uniform float uSeaShine; // scales the sun highlight, 1 is Seascape's own
uniform float uSeaReflection; // scales the sky reflection, 1 is Seascape's own
uniform float uSeaWind; // Beaufort force, 0 (mirror) to 12 (sea completely white)

const float PI = 3.141592;

// sea
const int ITER_GEOMETRY = 3;
const int ITER_FRAGMENT = 5;
const float SEA_HEIGHT = 0.6;
const float SEA_CHOPPY = 4.0;
const float SEA_SPEED = 0.8;
const float SEA_FREQ = 0.16;
#define SEA_TIME (1.0 + uSeaTime * SEA_SPEED)
const mat2 octave_m = mat2(1.6,1.2,-1.2,1.6);
// Port: each octave's drift turns about 40 degrees and speeds up 10%, so the layers don't all slide one way.
const mat2 OCTAVE_DRIFT_TURN = mat2(0.766,0.643,-0.643,0.766);

// Port: Dave Hoskins' hash without sine (shaders/noise.glsl), replacing fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123).
float hash( vec2 p ) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise( in vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f*f*(3.0-2.0*f);
  return -1.0 + 2.0 * mix( mix( hash( i + vec2(0.0,0.0) ),
                   hash( i + vec2(1.0,0.0) ), u.x),
              mix( hash( i + vec2(0.0,1.0) ),
                   hash( i + vec2(1.0,1.0) ), u.x), u.y);
}

float seaDiffuse(vec3 n,vec3 l,float p) {
  return pow(dot(n,l) * 0.4 + 0.6,p);
}

float seaSpecular(vec3 n,vec3 l,vec3 e,float s) {
  float nrm = (s + 8.0) / (PI * 8.0);
  return pow(max(dot(reflect(e,n),l),0.0),s) * nrm;
}

vec3 getSkyColor(vec3 e) {
  e.y = max(e.y,0.0);
  return vec3(pow(1.0-e.y,2.0), 1.0-e.y, 0.6+(1.0-e.y)*0.4);
}

// Port: Seascape's own per-octave noise push, made stronger (SEA_WARP) so the waves read less like a grid
// (Dana, 2026-10-27). Inferred, TUNABLE.
const float SEA_WARP = 2.0;
float sea_octave(vec2 uv, float choppy) {
  uv += noise(uv) * SEA_WARP;
  vec2 wv = 1.0-abs(sin(uv));
  vec2 swv = abs(cos(uv));
  wv = mix(wv,swv,wv);
  return pow(1.0-pow(wv.x * wv.y,0.65),choppy);
}

// Port: band-limiting (Quilez, "Bandlimiting"): each octave fades by smoothstep over the pixel footprint w and the
// loop stops once one is gone, which is also the main saving. w starts as fwidth of the wave coordinates times
// SEA_FREQ (set by the caller in gSeaFootprint) and grows 3.8 times per octave, since octave_m doubles the
// coordinates and freq grows 1.9 times. sea_octave repeats every PI, so it fades between half and one period per pixel.
float gSeaFootprint = 0.0;
float gSeaAmplitude = 1.0; // port: the fetch scale (seaFetchScale), set by the caller
float sea_octaves(vec2 xz, int firstOctave, int lastOctave) {
  float freq = SEA_FREQ;
  float amp = SEA_HEIGHT;
  float choppy = SEA_CHOPPY;
  vec2 uv = xz; uv.x *= 0.75;
  float d, h = 0.0;
  // Port: the stronger noise push (SEA_WARP) squeezes the waves, so it is counted in the footprint, as Quilez notes a
  // domain warp must be; otherwise far detail shimmers again. Approximate, TUNABLE.
  float footprint = gSeaFootprint * (1.0 + SEA_WARP);
  vec2 drift = vec2(1.0); // port: was the same SEA_TIME diagonal for every octave
  for(int i = 0; i < ITER_FRAGMENT; i++) {
    if (float(i) >= uSeaIterations || i >= lastOctave) break; // port: the Wave detail setting
    float band = smoothstep(PI, 0.5 * PI, footprint);
    if (band <= 0.0) break;
    if (i >= firstOctave) {
      d = sea_octave((uv+drift*SEA_TIME)*freq,choppy);
      d += sea_octave((uv-drift*SEA_TIME*0.8)*freq,choppy);
      h += d * amp * band;
    }
    uv *= octave_m; freq *= 1.9; amp *= 0.22;
    choppy = mix(choppy,1.0,0.2);
    drift = OCTAVE_DRIFT_TURN * drift * 1.1;
    footprint *= 3.8;
  }
  return h * gSeaAmplitude;
}

float map_detailed(vec3 p) {
  return p.y - sea_octaves(p.xz, 0, ITER_FRAGMENT);
}

// Port: currents. A flow map (Vlachos, "Water Flow in Portal 2", SIGGRAPH 2010) pushes the waves along a slow noise
// field: the waves are read twice, half a cycle apart, and blended so the push never visibly resets. Here the flow
// field is procedural noise instead of a painted texture. Scale, strength and rate inferred, TUNABLE.
const float FLOW_SCALE = 0.0025;
const float FLOW_STRENGTH = 60.0; // raised from 30 so the waves read less regular (Dana, 2026-10-27)
const float FLOW_RATE = 0.05;
vec2 seaFlow(vec2 xz) {
  return vec2(noise(xz * FLOW_SCALE), noise(xz * FLOW_SCALE + 19.1));
}
// Currents move only the two largest octaves (read twice, half a cycle apart); the smaller ones are read once.
const int CURRENT_OCTAVES = 2;
// Port: a slow bend of the wave coordinates, so crests curve instead of running in straight rows. It is a domain warp
// (Quilez), done as Roystan's toon water distorts its noise: coordinates + (noise * 2 - 1) * amount. Kept gentle (amount
// times scale well under 1) so the band-limiting footprint stays about right. Scale and amount inferred, TUNABLE.
const float BEND_SCALE = 0.03; // near the waves' own length, so the crests themselves bend (was 0.008)
const float BEND_AMOUNT = 10.0; // was 25
vec2 seaBend(vec2 xz) {
  return vec2(noise(xz * BEND_SCALE + 31.7), noise(xz * BEND_SCALE + 47.3)) * BEND_AMOUNT;
}
float sea_height(vec3 p) {
  p.xz += seaBend(p.xz);
  vec2 flow = seaFlow(p.xz) * FLOW_STRENGTH;
  float phase0 = fract(uSeaTime * FLOW_RATE);
  float phase1 = fract(uSeaTime * FLOW_RATE + 0.5);
  float big0 = sea_octaves(p.xz - flow * phase0, 0, CURRENT_OCTAVES);
  float big1 = sea_octaves(p.xz - flow * phase1, 0, CURRENT_OCTAVES);
  float small = sea_octaves(p.xz, CURRENT_OCTAVES, ITER_FRAGMENT);
  return p.y - (mix(big0, big1, abs(0.5 - phase0) / 0.5) + small);
}

// The sun glint as Cox and Munk's Gaussian slope distribution (Ocean Optics Web Book): mean square slope
// 0.003 + 0.00512 U for a clean sea, U the wind in m/s; bright where the facet mirroring the sun into the eye is a
// likely slope. The 0.25 brightness scale is inferred, TUNABLE.
uniform float uSeaWindSpeed;
float seaGlint(vec3 n, vec3 l, vec3 toEye, float slopeVariance) {
  vec3 halfway = normalize(l + toEye);
  float cosH = clamp(dot(n, halfway), 0.001, 1.0);
  float cos2 = cosH * cosH;
  float tan2 = (1.0 - cos2) / cos2;
  return 0.25 * exp(-tan2 / slopeVariance) / (PI * slopeVariance * cos2 * cos2) * step(0.0, dot(n, l));
}
float seaSlopeVariance(float fetch) {
  return max((0.003 + 0.00512 * uSeaWindSpeed) * fetch * fetch, 0.0015);
}

// getSeaColor with SEA_BASE, SEA_WATER_COLOR and the sky passed in (port). The sun highlight is Seascape's own up close
// and blends into the Cox and Munk glint where the waves are too small to see (far), Bruneton et al. 2010's idea.
vec3 seaColor(vec3 p, vec3 n, vec3 l, vec3 eye, vec3 dist, vec3 seaBase, vec3 seaWaterColor, vec3 skyTint, float far, float slopeVariance) {
  float fresnel = clamp(1.0 - dot(n,-eye), 0.0, 1.0);
  fresnel = clamp(pow(fresnel,3.0) * 0.65 * uSeaReflection, 0.0, 1.0);
  vec3 reflected = getSkyColor(reflect(eye,n)) * skyTint;
  vec3 refracted = seaBase + seaDiffuse(n,l,80.0) * seaWaterColor * 0.12;
  vec3 color = mix(refracted,reflected,fresnel);
  float atten = max(1.0 - dot(dist,dist) * 0.001, 0.0);
  color += seaWaterColor * (p.y - SEA_HEIGHT) * 0.18 * atten;
  color += vec3(mix(seaSpecular(n,l,eye,60.0), seaGlint(n,l,-eye,slopeVariance), far)) * uSeaShine;
  return color;
}

vec3 getNormal(vec3 p, float eps) {
  vec3 n;
  n.y = sea_height(p);
  n.x = sea_height(vec3(p.x+eps,p.y,p.z)) - n.y;
  n.z = sea_height(vec3(p.x,p.y,p.z+eps)) - n.y;
  n.y = eps;
  return normalize(n);
}

// ---- Additions for this project, not part of Seascape ----

// Seascape's longest wavelength, 2 pi / SEA_FREQ, in its own units.
const float SEA_WAVELENGTH = 39.3;
// How blunt the sun highlight gets once the waves are too small to see (Seascape's own is 60). Inferred, TUNABLE.
const float FAR_SPECULAR_POWER = 6.0;

// How far the waves are below pixel size, 0 to 1: Bruneton et al. 2010's idea that unseen waves become a smooth,
// rough-looking surface, approximated by flattening the normal and blunting the highlight. normalStep is the
// distance-smoothed sample step from Seascape's own getNormal call.
float seaFarFactor(float normalStep) {
  return smoothstep(0.2, 1.0, normalStep / SEA_WAVELENGTH);
}

// Crest foam by halftoning (Yingst, Alford and Parberry 2011): a foam saturation from wave height,
// f = (H - H0) / (Hmax - H0) (Kryachko's function, as they use it), shows only where it exceeds a clustered threshold
// mask, and fades by clamp(f - m, 0.15, ...) as in their code, so foam clumps and breaks up instead of tiling. Their
// mask is a 512x512 Gaussian-filtered white noise texture; here two octaves of smooth noise stand in for it
// (an approximation). Far away the thresholded pattern averages to its coverage, roughly the saturation (Dupuy and
// Bruneton 2012). Departing from the paper, the mask is not fixed: it moves with the currents (the same two-phase flow
// as sea_height) and a slow drift, in larger clusters. Heights, mask scale, drift and the far blend inferred, TUNABLE.
const float CREST_FOAM_START = 0.9;
const float CREST_FOAM_END = 1.3;
const float FOAM_MASK_SCALE = 0.04;
const vec2 FOAM_DRIFT = vec2(0.6, 0.35); // meters per second
float halftoneMaskAt(vec2 uv) {
  return clamp(0.5 + 0.35 * noise(uv) + 0.15 * noise(uv * 2.3 + 11.0), 0.0, 1.0);
}
float halftoneMask(vec2 seaXz) {
  vec2 xz = seaXz - FOAM_DRIFT * uSeaTime;
  vec2 flow = seaFlow(seaXz) * FLOW_STRENGTH;
  float phase0 = fract(uSeaTime * FLOW_RATE);
  float phase1 = fract(uSeaTime * FLOW_RATE + 0.5);
  float mask0 = halftoneMaskAt((xz - flow * phase0) * FOAM_MASK_SCALE);
  float mask1 = halftoneMaskAt((xz - flow * phase1) * FOAM_MASK_SCALE);
  return mix(mask0, mask1, abs(0.5 - phase0) / 0.5);
}

// Foam in patches: a slow, large noise thresholded with a soft smoothstep, as Roystan's toon water thresholds its
// surface noise (smoothstep(cutoff - AA, cutoff + AA, noise)), so most of the sea carries little crest foam and some
// areas a lot (whitecaps gather where the wind is strong). Scale, cutoff and softness inferred, TUNABLE.
const float FOAM_PATCH_SCALE = 0.003;
const float FOAM_PATCH_CUTOFF = 0.6;
const float FOAM_PATCH_SOFTNESS = 0.08; // narrowed from 0.15: the smooth noise rarely left that window, so no patches showed
float foamPatchiness(vec2 seaXz) {
  vec2 uv = (seaXz - FOAM_DRIFT * uSeaTime) * FOAM_PATCH_SCALE;
  float value = 0.5 + 0.35 * noise(uv + 5.3) + 0.15 * noise(uv * 2.1 + 17.9);
  return smoothstep(FOAM_PATCH_CUTOFF - FOAM_PATCH_SOFTNESS, FOAM_PATCH_CUTOFF + FOAM_PATCH_SOFTNESS, value);
}

// Wind sets how much of that foam shows, following the Beaufort scale's sea descriptions: no whitecaps below force 3,
// "scattered white horses" at 3, "many" at 5, "more extensive everywhere" at 6, streaks from 7, and a sea that "takes on
// a white appearance" from 10. The curve between those points is inferred, TUNABLE.
const float SEA_WIND_DEFAULT = 4.0; // force 4, "fairly frequent white horses": the look before the Wind setting
float seaWindScale() {
  return uSeaWind / SEA_WIND_DEFAULT;
}
float seaWhitecaps() {
  return smoothstep(2.5, 5.5, uSeaWind);
}
// Storm foam: from force 7 the Beaufort scale describes foam "blown in streaks", denser up to 12. Drawn as noise
// stretched along the wind (x), so it forms streaks instead of a flat veil. Stretch, scale and the 0.3 cap inferred,
// TUNABLE (Dana, 2026-10-27: a flat 70% white looked like an overlay).
const float STORM_FOAM_MAX = 0.3;
float seaStormStrength() {
  return smoothstep(6.5, 12.0, uSeaWind) * STORM_FOAM_MAX;
}
float foamStreaks(vec2 seaXz) {
  vec2 uv = vec2((seaXz.x - uSeaTime * 2.0) * 0.004, seaXz.y * 0.04);
  return smoothstep(0.0, 0.6, 0.5 * noise(uv) + 0.3 * noise(uv * 2.7 + 9.1) + 0.2);
}
float seaWhiteSea(vec2 seaXz) {
  return seaStormStrength() * foamStreaks(seaXz);
}
// The streaks' average, for the planet seen from orbit where single streaks are smaller than a pixel.
float seaWhiteSeaAverage() {
  return seaStormStrength() * 0.5;
}
// Port: the halftone's hard step (foam starting at 0.15) became a fade, so the specks have soft edges (Dana, 2026-10-27).
const float CREST_FOAM_FADE = 0.3;
// Far away, where single crests are smaller than a pixel, foam is the sea's overall white share by wind (the Beaufort
// descriptions), instead of the faded wave height, which is zero there. Amount inferred, TUNABLE.
float seaFarFoam() {
  return max(seaWhitecaps() * 0.08 * seaWindScale(), seaWhiteSeaAverage());
}
float crestFoam(float waveHeight, float far, vec2 seaXz) {
  float saturation = clamp((waveHeight - CREST_FOAM_START) / (CREST_FOAM_END - CREST_FOAM_START), 0.0, 1.0);
  float mask = halftoneMask(seaXz);
  float near = smoothstep(0.0, CREST_FOAM_FADE, saturation - mask);
  float patches = mix(foamPatchiness(seaXz), 1.0, smoothstep(5.0, 8.0, uSeaWind)); // foam everywhere in strong wind
  return max(mix(near * patches * seaWhitecaps(), seaFarFoam(), far), mix(seaWhiteSea(seaXz), seaWhiteSeaAverage(), far));
}

// Fetch: waves grow with how far the wind blows over open water, so enclosed water stays calm and open ocean is
// rough (max height grows about as the square root of fetch, Kalff's lake estimate). Depth stands in for fetch here,
// since deep water is usually open ocean. Calm share and full depth inferred, TUNABLE.
const float FETCH_CALM = 0.3;
const float FETCH_OPEN_DEPTH = 0.4;
float seaFetchScale(float depthShare) {
  return mix(FETCH_CALM, 1.0, sqrt(clamp(depthShare / FETCH_OPEN_DEPTH, 0.0, 1.0)));
}

// Surf: waves that travel toward the shore by distance to the coast (the GameDev.net ocean log's surf profile; depth
// stands in for distance), steep in front and long behind, timing varied along the coast by noise. The wave tilts the
// surface and leaves foam behind its crest, thresholded against noise as Roystan's toon water does. Returns the slope
// (x, z) and the foam. Values inferred, TUNABLE.
// Where waves break: the McCowan criterion, a wave breaks once the water is shallower than about its height / 0.78 (a
// first estimate; Goda 2010 notes it varies with slope). uSurfZone is that depth as a share of the deepest water, set
// from the wind's wave height (voxel/chunkWater.ts).
uniform float uSurfZone;
const float SHORE_BANDS = 4.0;
const float SHORE_SPEED = 0.15;
const float SURF_FRONT = 0.06;
const float SURF_HEIGHT = 0.8;
const float SURF_JITTER_SCALE = 0.02;
const float SURF_JITTER = 0.6;
const float SURF_FOAM_DECAY = 7.0;
const float SURF_FOAM_SOFTNESS = 0.15;
float surfProfile(float f) {
  f = clamp(f, 0.0, 1.0);
  return smoothstep(0.0, SURF_FRONT, f) * pow(1.0 - f, 3.0);
}
// The world-space gradient of a value from its screen-space derivatives (two equations, two unknowns).
vec2 worldGradient(float value, vec2 xz) {
  vec2 dx = dFdx(xz);
  vec2 dy = dFdy(xz);
  float dvx = dFdx(value);
  float dvy = dFdy(value);
  float det = dx.x * dy.y - dx.y * dy.x;
  if (abs(det) < 1e-12) return vec2(0.0);
  return vec2(dvx * dy.y - dx.y * dvy, dx.x * dvy - dvx * dy.x) / det;
}
// depthGradient is how depthShare changes per unit of seaXz, read smoothly from the ground's heights by the caller (not
// screen derivatives, which step in 2x2-pixel blocks). footprint is the pixel size in seaXz units: bands thinner than
// about two pixels fade out (Quilez's band-limiting), so the surf fades with distance instead of turning jagged.
vec3 surfWave(float depthShare, vec2 seaXz, float breakup, vec2 depthGradient, float footprint) {
  float zone = max(uSurfZone, 0.0001);
  float phase = depthShare / zone * SHORE_BANDS + uSeaTime * SHORE_SPEED + noise(seaXz * SURF_JITTER_SCALE) * SURF_JITTER;
  vec2 phaseGradient = depthGradient / zone * SHORE_BANDS;
  float visible = 1.0 - smoothstep(0.25, 0.5, length(phaseGradient) * footprint);
  float closeness = clamp(1.0 - depthShare / zone, 0.0, 1.0) * visible;
  float f = fract(phase);
  float slope = (surfProfile(f + 0.01) - surfProfile(f - 0.01)) / 0.02;
  vec2 tilt = phaseGradient * slope * SURF_HEIGHT * clamp(seaWindScale(), 0.2, 2.0) * closeness; // swell remains when calm
  float band = smoothstep(0.0, SURF_FRONT, f) * exp(-f * SURF_FOAM_DECAY) * closeness;
  float cutoff = 1.0 - band;
  float foam = smoothstep(cutoff - SURF_FOAM_SOFTNESS, cutoff + SURF_FOAM_SOFTNESS, breakup) * step(0.001, closeness);
  return vec3(tilt, foam);
}

// The planet's patterns by triplanar mapping (Catlike Coding, "Triplanar Mapping"): three flat projections of the
// sphere point (zy, xz, xy) blended by the surface direction, so nothing jumps where the cube's faces meet. Weights
// as published: abs(normal) minus a 0.25 offset, raised to 2, normalized.
vec3 triplanarWeights(vec3 normal) {
  vec3 weights = clamp(abs(normal) - 0.25, 0.0, 1.0);
  weights = weights * weights;
  return weights / (weights.x + weights.y + weights.z);
}
float seaHeightTriplanar(vec3 pos, vec3 weights) {
  float h = 0.0;
  if (weights.x > 0.001) h += weights.x * -sea_height(vec3(pos.z, 0.0, pos.y));
  if (weights.y > 0.001) h += weights.y * -sea_height(vec3(pos.x, 0.0, pos.z));
  if (weights.z > 0.001) h += weights.z * -sea_height(vec3(pos.x, 0.0, pos.y));
  return h;
}
// Seascape's getNormal on the triplanar height, stepping along the point's own frame (x, up, z).
vec3 seaNormalTriplanar(vec3 pos, float h, vec3 frameX, vec3 frameZ, vec3 weights, float eps) {
  float hx = seaHeightTriplanar(pos + frameX * eps, weights);
  float hz = seaHeightTriplanar(pos + frameZ * eps, weights);
  return normalize(vec3(h - hx, eps, h - hz));
}
float crestFoamTriplanar(float waveHeight, float far, vec3 pos, vec3 weights) {
  float foam = 0.0;
  if (weights.x > 0.001) foam += weights.x * crestFoam(waveHeight, far, pos.zy);
  if (weights.y > 0.001) foam += weights.y * crestFoam(waveHeight, far, pos.xz);
  if (weights.z > 0.001) foam += weights.z * crestFoam(waveHeight, far, pos.xy);
  return foam;
}

// Water variance: a few large Gerstner waves (GPU Gems 1, ch. 1; planet/oceanSpectrum.ts sets them from the wind by
// Pierson-Moskowitz) tilt the surface over broad areas, so slow lighter and darker patches move across the water under
// Seascape's own waves (Dana, 2026-10-27). Speeds from the deep-water dispersion relation, omega^2 = g k (Tessendorf);
// each wave fades once shorter than two pixels (Quilez). strength is the fetch scale. Returns the surface slope (x, z).
uniform float uSeaClock; // real seconds; uSeaTime runs faster in wind
uniform float uSeaWaveScale;
const int MAX_WAVES = 20;
uniform float uWaveCount;
uniform vec2 uWaveDirections[MAX_WAVES];
uniform float uWaveLengths[MAX_WAVES];
uniform float uWaveAmplitudes[MAX_WAVES];
uniform float uWaveSteepness[MAX_WAVES];
// Also returns, as z, foam where these waves pinch the surface: Tessendorf's Jacobian of the horizontal displacement
// (eq. 45; applying it to Gerstner sums is inferred), feathered by a smoothstep and set by the wind's whitecaps.
// Thresholds inferred, TUNABLE.
vec3 waterVariance(vec2 xz, float footprint, float strength) {
  vec2 slope = vec2(0.0);
  float jxx = 0.0;
  float jzz = 0.0;
  float jxz = 0.0;
  for (int i = 0; i < MAX_WAVES; i++) {
    if (float(i) >= uWaveCount) break;
    float wavelength = uWaveLengths[i];
    float band = 1.0 - smoothstep(0.25, 0.5, footprint / wavelength);
    if (band <= 0.0) continue;
    float k = 2.0 * PI / wavelength;
    float omega = sqrt(9.8 * k / max(uSeaWaveScale, 0.0001));
    vec2 dir = uWaveDirections[i];
    float phase = k * dot(dir, xz) - omega * uSeaClock;
    float waveSlope = uWaveAmplitudes[i] * k * band * strength;
    slope += dir * waveSlope * cos(phase);
    float squeeze = uWaveSteepness[i] * waveSlope * sin(phase);
    jxx -= squeeze * dir.x * dir.x;
    jzz -= squeeze * dir.y * dir.y;
    jxz -= squeeze * dir.x * dir.y;
  }
  float jacobian = (1.0 + jxx) * (1.0 + jzz) - jxz * jxz;
  return vec3(slope, smoothstep(0.8, 0.35, jacobian) * seaWhitecaps());
}
