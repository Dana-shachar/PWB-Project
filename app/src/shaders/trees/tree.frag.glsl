// A tree's look: a two-hue gradient (canopy inner and lower to outer and top; trunk base to top), lit and toon shaded
// the way rocks and the ground are (rock.frag.glsl: fill, wrap diffuse, Unity Toon Shader's shade mask, a hue-turned
// shade, [S83]). Functions from terrain.glsl and landLayers.glsl.
uniform float uIsLeaf;
uniform vec3 uColorA; // canopy inner, or trunk base
uniform vec3 uColorB; // canopy outer, or trunk top
uniform vec3 uTipColorA; // leaf tips' pair, the canopy's turned by the tip hue
uniform vec3 uTipColorB;
uniform float uTreeSize; // the tree's bounding radius, for the detail fade
uniform float uDetailNear; // camera distance in tree sizes: full per-part detail nearer, none past far
uniform float uDetailFar;
uniform vec3 uCanopyCenter;
uniform float uCanopyRadius;
uniform float uCanopyBottom;
uniform float uCanopyTop;
uniform float uTrunkTop;
uniform vec3 uLightDirection;
uniform float uLightIntensity;
uniform float uDiffuseWrap;
uniform float uAmbient;
uniform vec3 uFillColor;
uniform float uShadeStep;
uniform float uShadeFeather;
uniform float uShadeLift;
uniform float uShadeChroma;
uniform float uShadeHueTurn;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vLocal;
varying float vShade;
varying float vAlong;

const float TOON_DETAIL = 0.5; // as rock.frag.glsl
const float HEIGHT_WEIGHT = 0.6; // canopy gradient: how much height counts against distance out from the center. TUNABLE

void main() {
  float gradient;
  if (uIsLeaf > 0.5) {
    float heightShare = (vLocal.y - uCanopyBottom) / max(uCanopyTop - uCanopyBottom, 1e-3);
    float outShare = length(vLocal - uCanopyCenter) / max(uCanopyRadius, 1e-3);
    gradient = clamp(HEIGHT_WEIGHT * heightShare + (1.0 - HEIGHT_WEIGHT) * outShare, 0.0, 1.0);
  } else {
    gradient = clamp(vLocal.y / max(uTrunkTop, 1e-3), 0.0, 1.0);
  }
  // Only leaves carry a brightness jitter; the trunk has no such attribute, which would read as 0.
  float blend = smoothstep(0.0, 1.0, gradient);
  vec3 surfaceColor = mix(uColorA, uColorB, blend);
  if (uIsLeaf > 0.5) {
    // Each part blends from base to tip toward the tip hue, only up close (LOD by screen size).
    float sizes = distance(cameraPosition, vWorldPosition) / max(uTreeSize, 1e-3);
    float detail = 1.0 - smoothstep(uDetailNear, uDetailFar, sizes);
    surfaceColor = mix(surfaceColor, mix(uTipColorA, uTipColorB, blend), smoothstep(0.0, 1.0, vAlong) * detail) * vShade;
  }

  vec3 normal = normalize(vWorldNormal);
  if (!gl_FrontFacing) normal = -normal; // thin parts are seen from both sides
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 lightDir = normalize(uLightDirection);
  float diffuse = softDiffuse(normal, lightDir, uDiffuseWrap) * uLightIntensity;
  vec3 fill = fillLight(normal, up, uFillColor, uAmbient);
  vec3 litColor = surfaceColor * (fill + diffuse);
  float halfLambert = 0.5 * dot(normal, lightDir) + 0.5;
  if (uShadeStep > 0.0) {
    float shadeMask = toonShadeMask(halfLambert, uShadeStep, uShadeFeather);
    vec3 baseColor = surfaceColor * (fill + mix(uLightIntensity, diffuse, TOON_DETAIL));
    vec3 shade = shadeColor(surfaceColor, uShadeHueTurn, uShadeLift, uShadeChroma) + surfaceColor * fill;
    litColor = mix(baseColor, shade, shadeMask);
  }
  gl_FragColor = vec4(litColor, 1.0);
  #include <colorspace_fragment>
}
