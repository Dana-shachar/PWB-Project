// The air's ground (atmosphere/airGround.ts): the planet's surface averaged over a wide area, in world units above the
// radius, so the haze, glow and clouds follow the planet's broad shape.
uniform samplerCube uAirGround;
uniform float uAirAmplitude;
float airGroundLift(vec3 direction) {
  return texture(uAirGround, direction).r * uAirAmplitude;
}
