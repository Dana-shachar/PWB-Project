// The planet's haze along a view ray (atmosphere/planetAir.ts). As in Lague's "Coding Adventure: Atmosphere": the ray
// runs through the air layer and stops at the surface, dstToSurface = min(sceneDepth, dstToOcean). The air thins
// exponentially with height above the air's ground (airGround.glsl; scale height as in O'Neil's GPU Gems 2), summed in
// a few steps, opacity 1 - e^(-optical depth). Needs airGround.glsl first. Step count and cap inferred, TUNABLE.
const int HAZE_STEPS = 8;
const float HAZE_MAX_OPACITY = 0.85;
uniform vec3 uHazeColor;
uniform float uHazeDensity;
uniform float uHazeScaleHeight;
uniform vec3 uHazeCenter;
uniform float uHazeSeaRadius;
uniform float uHazePlanetRadius;
uniform float uHazeAirRadius;

// Distances along the ray to where it enters and leaves a sphere; x > y when it misses.
vec2 hazeSphereHits(vec3 origin, vec3 direction, float radius) {
  vec3 fromCenter = origin - uHazeCenter;
  float b = dot(fromCenter, direction);
  float h = b * b - (dot(fromCenter, fromCenter) - radius * radius);
  if (h < 0.0) return vec2(1.0, -1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

// The haze's color and opacity between `origin` and the surface `surfaceDistance` along `direction` (a very large
// distance for the sky). Lit by the sun at the stretch's middle, softly wrapped, dim on the night side.
vec4 planetHaze(vec3 origin, vec3 direction, float surfaceDistance, vec3 lightDirection, float ambient) {
  vec2 air = hazeSphereHits(origin, direction, uHazeAirRadius);
  vec2 sea = hazeSphereHits(origin, direction, uHazeSeaRadius);
  float toSurface = min(surfaceDistance, sea.x <= sea.y && sea.x > 0.0 ? sea.x : 1e20);
  float enter = max(air.x, 0.0);
  float leave = min(air.y, toSurface);
  if (uHazeDensity <= 0.0 || leave <= enter) return vec4(0.0);
  float stepLength = (leave - enter) / float(HAZE_STEPS);
  float depth = 0.0;
  for (int i = 0; i < HAZE_STEPS; i++) {
    vec3 fromCenter = origin + direction * (enter + (float(i) + 0.5) * stepLength) - uHazeCenter;
    float height = max(length(fromCenter) - uHazePlanetRadius - airGroundLift(normalize(fromCenter)), 0.0);
    depth += exp(-height / uHazeScaleHeight) * stepLength;
  }
  float opacity = min(1.0 - exp(-uHazeDensity * depth / uHazeScaleHeight), HAZE_MAX_OPACITY);
  vec3 middle = normalize(origin + direction * (enter + leave) * 0.5 - uHazeCenter);
  float sunlit = clamp((dot(middle, normalize(lightDirection)) + 0.5) / 1.5, 0.0, 1.0);
  return vec4(uHazeColor * (ambient + sunlit), opacity);
}
