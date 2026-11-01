// The air's ground (atmosphere/airGround.ts): the planet's surface averaged over a wide area, in world units above the
// radius, so the haze, glow and clouds follow the planet's broad shape.
uniform samplerCube uAirGround;
uniform float uAirAmplitude;
uniform mat3 uPlanetFrame; // world to planet: the map is in the planet's own, spinning frame (scene/planetSpin.ts)
float airGroundLift(vec3 direction) {
  return texture(uAirGround, direction).r * uAirAmplitude;
}
float airGroundLiftWorld(vec3 direction) {
  return airGroundLift(uPlanetFrame * direction);
}
