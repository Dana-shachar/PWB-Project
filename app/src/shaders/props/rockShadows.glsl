// The rocks' cast shadows (props/rockScatter.ts), from three.js's shadow map (its ShadowMaterial's pieces), shared by the
// ground and the rocks. Joined after landLayers.glsl (shadeColor).
#include <common>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>

// Shadows fade out over the outer share of the shadow map's box, so its edge never shows as you move (the shadow
// distance fade engines use, as Unity's). TUNABLE
const float SHADOW_EDGE_FADE = 0.15;
const float ROCK_SHADOW_DARKNESS = 0.6; // the shadowed color's value, as a share of the color it falls on. TUNABLE

// Darkens the color already there, never replaces it, so a shadow on shaded ground makes it darker still. The edge
// follows the toon shading's feather; the darkening takes the shade's hue turn and chroma (landLayers.glsl shadeColor).
// A shadow is missing direct sun, so it shows as much as the surface faces the sun (facing: its normal against the
// light): full on ground turned to the sun, none where sunlight only skims a slope. TUNABLE range
vec3 applyRockShadow(vec3 color, float hueTurn, float chroma, float feather, float facing) {
  float lit = getShadowMask();
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    vec3 coord = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
    float fromEdge = min(min(coord.x, 1.0 - coord.x), min(coord.y, 1.0 - coord.y));
    lit = mix(1.0, lit, smoothstep(0.0, SHADOW_EDGE_FADE, fromEdge));
  #endif
  float edge = max(feather, 0.02);
  float shade = smoothstep(0.5 - edge, 0.5 + edge, 1.0 - lit) * smoothstep(0.05, 0.35, facing);
  return mix(color, shadeColor(color, hueTurn, ROCK_SHADOW_DARKNESS, chroma), shade);
}
