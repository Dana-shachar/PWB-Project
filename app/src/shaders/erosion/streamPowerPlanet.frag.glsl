// Stream power erosion, one iteration per pass: Schott et al. 2023, ported from data/shaders/spe_shader.glsl in
// H-Schott/StreamPowerErosion (MIT, compared 2026-11-02). R = height, G = drainage area, B = 1 on ocean cells.
// Changes from the source: the map wraps east to west, east-west distances shrink with latitude (map geometry,
// no source read), the ocean replaces the fixed border as the outlet (it keeps its height and passes no water on),
// and hillslope smoothing is a share per pass (below).

uniform sampler2D uState;
uniform vec2 uSize;
uniform vec2 uCellSize; // meters at the equator, east-west and north-south
uniform float uK; // Schott's k
uniform float uDiffusion; // hillslope share per pass, at most MAX_DIFFUSION_SHARE
uniform float uDt;
uniform float uAreaExponent; // Schott's p_sa
uniform float uSlopeExponent; // Schott's p_sl
uniform float uFlowExponent; // Schott's p_flow (Freeman's split)

const ivec2 NEXT8[8] = ivec2[8](ivec2(0, 1), ivec2(1, 1), ivec2(1, 0), ivec2(1, -1),
                                ivec2(0, -1), ivec2(-1, -1), ivec2(-1, 0), ivec2(-1, 1));

bool offMap(ivec2 cell) { return cell.y < 0 || cell.y >= int(uSize.y); }

ivec2 wrap(ivec2 cell) { return ivec2((cell.x + int(uSize.x)) % int(uSize.x), cell.y); }

vec4 readCell(ivec2 cell) { return texelFetch(uState, wrap(cell), 0); }

float cosLatitude(ivec2 cell) { return cos(((float(cell.y) + 0.5) / uSize.y - 0.5) * 3.14159265); }

// Distance between neighbors, east-west measured at the first cell's latitude.
float cellDistance(ivec2 from, ivec2 offset) {
  return length(vec2(offset) * vec2(uCellSize.x * max(cosLatitude(from), 1e-3), uCellSize.y));
}

// Rise from p to q over their distance, 0 off the map, as Schott's Slope.
float slope(ivec2 p, ivec2 q) {
  if (offMap(p) || offMap(q) || p == q) return 0.0;
  return (readCell(q).r - readCell(p).r) / cellDistance(p, q - p);
}

ivec2 flowSteepest(ivec2 p) {
  ivec2 dir = ivec2(0);
  float maxSlope = 0.0;
  for (int i = 0; i < 8; i++) {
    float ss = slope(p + NEXT8[i], p);
    if (ss > maxSlope) { maxSlope = ss; dir = NEXT8[i]; }
  }
  return dir;
}

// The share of top's water that flows to bot, by slope to the power p_flow.
float flowCoeff(ivec2 bot, ivec2 top) {
  float ss = slope(bot, top);
  if (ss <= 0.0) return 0.0;
  float slopeSum = 0.0;
  for (int i = 0; i < 8; i++) {
    float next = slope(top + NEXT8[i], top);
    if (next > 0.0) slopeSum += pow(next, uFlowExponent);
  }
  return pow(ss, uFlowExponent) / slopeSum;
}

// Hillslope smoothing as a share of the height difference per pass (the explicit diffusion step), not Schott's k_h in
// meters: at 18 km cells his constant does almost nothing. East-west cells shrink with latitude, so that share grows
// there, capped at the explicit step's stability limit. The share itself is inferred, TUNABLE.
const float MAX_DIFFUSION_SHARE = 0.2;
float hillslope(ivec2 p, float here) {
  float dx = uCellSize.x * max(cosLatitude(p), 1e-3);
  float shareX = min(uDiffusion * (uCellSize.y * uCellSize.y) / (dx * dx), MAX_DIFFUSION_SHARE);
  ivec2 up = offMap(p + ivec2(0, 1)) ? p : p + ivec2(0, 1);
  ivec2 down = offMap(p - ivec2(0, 1)) ? p : p - ivec2(0, 1);
  return shareX * (readCell(p + ivec2(1, 0)).r + readCell(p - ivec2(1, 0)).r - 2.0 * here)
       + uDiffusion * (readCell(up).r + readCell(down).r - 2.0 * here);
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 data = readCell(p);
  float cellArea = length(vec2(uCellSize.x * max(cosLatitude(p), 1e-3), uCellSize.y)); // Schott's length(cellDiag)

  float water = 0.0;
  for (int i = 0; i < 8; i++) {
    ivec2 q = p + NEXT8[i];
    if (offMap(q)) continue;
    vec4 neighbor = readCell(q);
    if (neighbor.b > 0.5) continue; // the ocean passes no water on
    water += neighbor.g * flowCoeff(p, q);
  }

  if (data.b > 0.5) {
    gl_FragColor = vec4(data.r, water, 1.0, 1.0); // keeps its height; G sums what reached the sea
    return;
  }

  data.g = cellArea + water;
  ivec2 dir = flowSteepest(p);
  float receiverHeight = readCell(p + dir).r;
  float pslope = abs(slope(p + dir, p));
  float spe = uK * pow(data.g, uAreaExponent) * pow(pslope, uSlopeExponent);
  float newHeight = data.r - uDt * spe + hillslope(p, data.r);
  data.r = max(newHeight, receiverHeight);
  gl_FragColor = vec4(data.r, data.g, 0.0, 1.0);
}
