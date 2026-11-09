// The land's color and light layers, shared by the planet patches and the chunk (joined as text, like terrain.glsl).

// The sky fill: one light straight down, so faces turned up to the sky get the most (Quilez, outdoor lighting:
// sky = clamp(0.5 + 0.5 * nor.y); three.js's hemisphere light with a black ground). Tinted, so shadows take a color.
vec3 fillLight(vec3 normal, vec3 up, vec3 fillColor, float ambient) {
  return fillColor * ambient * clamp(0.5 + 0.5 * dot(normal, up), 0.0, 1.0);
}

// Rock on steep ground, the standard slope-based terrain texturing: steepness 1 - dot(normal, up) (0 flat, 1 a wall) past
// Slope, eased over Softness, takes the rock ramp's color at this height (rockColor) instead of the land ramp's.
vec3 landSurfaceColor(vec3 rampColor, vec3 rockColor, vec3 normal, vec3 up, float slopeStart, float softness) {
  float steepness = 1.0 - clamp(dot(normalize(normal), normalize(up)), 0.0, 1.0);
  float rock = smoothstep(slopeStart, slopeStart + max(softness, 1e-3), steepness);
  return mix(rampColor, rockColor, rock);
}
