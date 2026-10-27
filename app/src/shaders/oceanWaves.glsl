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
 * (Quilez); and getNormal reads sea_height, which adds currents (flow, see below). The rest is the original. Used by voxel/chunkWater.ts and the planet.
 */

uniform float uSeaTime; // seconds
uniform float uSeaIterations; // 1 to ITER_FRAGMENT

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

float sea_octave(vec2 uv, float choppy) {
  uv += noise(uv);
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
float sea_octaves(vec2 xz, int firstOctave, int lastOctave) {
  float freq = SEA_FREQ;
  float amp = SEA_HEIGHT;
  float choppy = SEA_CHOPPY;
  vec2 uv = xz; uv.x *= 0.75;
  float d, h = 0.0;
  float footprint = gSeaFootprint;
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
  return h;
}

float map_detailed(vec3 p) {
  return p.y - sea_octaves(p.xz, 0, ITER_FRAGMENT);
}

// Port: currents. A flow map (Vlachos, "Water Flow in Portal 2", SIGGRAPH 2010) pushes the waves along a slow noise
// field: the waves are read twice, half a cycle apart, and blended so the push never visibly resets. Here the flow
// field is procedural noise instead of a painted texture. Scale, strength and rate inferred, TUNABLE.
const float FLOW_SCALE = 0.0025;
const float FLOW_STRENGTH = 30.0;
const float FLOW_RATE = 0.05;
vec2 seaFlow(vec2 xz) {
  return vec2(noise(xz * FLOW_SCALE), noise(xz * FLOW_SCALE + 19.1));
}
// Currents move only the two largest octaves (read twice, half a cycle apart); the smaller ones are read once.
const int CURRENT_OCTAVES = 2;
float sea_height(vec3 p) {
  vec2 flow = seaFlow(p.xz) * FLOW_STRENGTH;
  float phase0 = fract(uSeaTime * FLOW_RATE);
  float phase1 = fract(uSeaTime * FLOW_RATE + 0.5);
  float big0 = sea_octaves(p.xz - flow * phase0, 0, CURRENT_OCTAVES);
  float big1 = sea_octaves(p.xz - flow * phase1, 0, CURRENT_OCTAVES);
  float small = sea_octaves(p.xz, CURRENT_OCTAVES, ITER_FRAGMENT);
  return p.y - (mix(big0, big1, abs(0.5 - phase0) / 0.5) + small);
}

// getSeaColor with SEA_BASE, SEA_WATER_COLOR, the sky and the highlight's sharpness (originally 60.0) passed in (port).
vec3 seaColor(vec3 p, vec3 n, vec3 l, vec3 eye, vec3 dist, vec3 seaBase, vec3 seaWaterColor, vec3 skyTint, float specularPower) {
  float fresnel = clamp(1.0 - dot(n,-eye), 0.0, 1.0);
  fresnel = pow(fresnel,3.0) * 0.65;
  vec3 reflected = getSkyColor(reflect(eye,n)) * skyTint;
  vec3 refracted = seaBase + seaDiffuse(n,l,80.0) * seaWaterColor * 0.12;
  vec3 color = mix(refracted,reflected,fresnel);
  float atten = max(1.0 - dot(dist,dist) * 0.001, 0.0);
  color += seaWaterColor * (p.y - SEA_HEIGHT) * 0.18 * atten;
  color += vec3(seaSpecular(n,l,eye,specularPower));
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
// Bruneton 2012). Heights, mask scale and the far blend inferred, TUNABLE.
const float CREST_FOAM_START = 0.9;
const float CREST_FOAM_END = 1.3;
const float FOAM_MASK_SCALE = 0.12;
float halftoneMask(vec2 seaXz) {
  vec2 uv = seaXz * FOAM_MASK_SCALE;
  return clamp(0.5 + 0.35 * noise(uv) + 0.15 * noise(uv * 2.3 + 11.0), 0.0, 1.0);
}
float crestFoam(float waveHeight, float far, vec2 seaXz) {
  float saturation = clamp((waveHeight - CREST_FOAM_START) / (CREST_FOAM_END - CREST_FOAM_START), 0.0, 1.0);
  float mask = halftoneMask(seaXz);
  float near = saturation > mask ? clamp(saturation - mask, 0.15, 1.0) : 0.0;
  return mix(near, saturation * 0.5, far);
}

// Waves breaking on the shore: foam bands that travel toward the coast through the shallows, strongest at the
// water's edge (shoreline waves driven by distance to shore, as in the Croakwood devlog and a GameDev.net ocean log;
// here water depth stands in for that distance). Zone, spacing and speed inferred, TUNABLE.
const float SHORE_ZONE = 0.12;
const float SHORE_BANDS = 4.0;
const float SHORE_SPEED = 0.15;
float shoreWaveFoam(float depthShare, float breakup) {
  if (depthShare >= SHORE_ZONE) return 0.0;
  float closeness = 1.0 - depthShare / SHORE_ZONE;
  float phase = depthShare / SHORE_ZONE * SHORE_BANDS + uSeaTime * SHORE_SPEED;
  float band = pow(0.5 + 0.5 * sin(phase * 6.2831853), 8.0);
  return band * closeness * breakup;
}
