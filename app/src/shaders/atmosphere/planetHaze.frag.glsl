// The haze over the planet's surface: the horizon color, as thick as the air the view ray crosses (Beer-Lambert,
// 1 - e^(-optical depth)). The air thins exponentially with height (scale height uScaleHeight, as in O'Neil's GPU Gems 2
// atmosphere), summed in a few steps along the ray, so it is one gradient with no top edge. Lit by the sun (softly
// wrapped, dim on the night side). Step count, cap and light amounts inferred, TUNABLE.
const int HAZE_STEPS = 8;
const float HAZE_MAX_OPACITY = 0.85;
uniform vec3 hazeColor;
uniform float uDensity; // optical depth straight down from the ground, per scale height
uniform float uScaleHeight;
uniform vec3 uCenter;
uniform float uRadius; // the ground
uniform float uAirRadius; // the top of the air layer
uniform vec3 uCameraPosition;
uniform vec3 uLightDirection;
uniform float uAmbient;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

// Distances along the ray to where it enters and leaves a sphere; x > y when it misses.
vec2 sphereHits(vec3 origin, vec3 direction, float radius) {
  vec3 fromCenter = origin - uCenter;
  float b = dot(fromCenter, direction);
  float h = b * b - (dot(fromCenter, fromCenter) - radius * radius);
  if (h < 0.0) return vec2(1.0, -1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec3 rayDirection = normalize(vWorldPosition - uCameraPosition);
  vec2 air = sphereHits(uCameraPosition, rayDirection, uAirRadius);
  vec2 ground = sphereHits(uCameraPosition, rayDirection, uRadius);
  float enter = max(air.x, 0.0);
  float leave = ground.x <= ground.y && ground.x > 0.0 ? ground.x : air.y;
  float stepLength = max(leave - enter, 0.0) / float(HAZE_STEPS);
  float depth = 0.0;
  for (int i = 0; i < HAZE_STEPS; i++) {
    vec3 point = uCameraPosition + rayDirection * (enter + (float(i) + 0.5) * stepLength);
    float height = max(length(point - uCenter) - uRadius, 0.0);
    depth += exp(-height / uScaleHeight) * stepLength;
  }
  float opacity = min(1.0 - exp(-uDensity * depth / uScaleHeight), HAZE_MAX_OPACITY);
  float sunlit = clamp((dot(normalize(vWorldNormal), normalize(uLightDirection)) + 0.5) / 1.5, 0.0, 1.0);
  gl_FragColor = vec4(hazeColor * (uAmbient + sunlit), opacity);
}
