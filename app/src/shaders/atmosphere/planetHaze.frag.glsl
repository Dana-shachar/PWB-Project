// The haze over the planet's surface: the horizon color, as thick as the air the view ray crosses, from entering a thin
// air layer to reaching the ground (Beer-Lambert, 1 - e^(-density * path)), so it thickens smoothly toward the edges
// and never bands. Lit by the sun (softly wrapped, dim on the night side). Light amounts inferred.
uniform vec3 hazeColor;
uniform float uDensity; // per air-layer thickness of path
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
  float path = max(leave - enter, 0.0) / max(uAirRadius - uRadius, 1e-6);
  float opacity = 1.0 - exp(-uDensity * path);
  float sunlit = clamp((dot(normalize(vWorldNormal), normalize(uLightDirection)) + 0.5) / 1.5, 0.0, 1.0);
  gl_FragColor = vec4(hazeColor * (uAmbient + sunlit), opacity);
}
