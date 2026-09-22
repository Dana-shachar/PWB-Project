uniform vec3 uBaseColor;
uniform vec3 uLightDirection;
uniform float uAmbient;
uniform sampler2D uHeightMap;
uniform float uDisplacementAmplitude;
uniform float uRadius;
uniform mat3 normalMatrix; // Three.js built-in, auto-set but not auto-declared in fragment stage

varying vec2 vUv;

void main() {
  // Analytic sphere tangent basis, matching heightmap.frag.glsl's
  // uvToSpherePosition — smooth and mesh-resolution-independent (unlike a
  // screen-space-derivative normal, which facets per-triangle). Then
  // perturbed by the heightmap's own central-difference gradient for fine
  // per-texel bump detail. See ISSUES.md, 2026-09-16.
  float longitude = (vUv.x - 0.5) * 2.0 * 3.14159265;
  float latitude = (vUv.y - 0.5) * 3.14159265;
  float cosLat = cos(latitude);
  vec3 localNormal = vec3(cosLat * cos(longitude), sin(latitude), cosLat * sin(longitude));
  // Scaled by uRadius so this is in the same real-world units as the
  // displacement term below, instead of unit-sphere-relative — otherwise
  // the height term dwarfs it and dominates the result. See ISSUES.md, 2026-09-16.
  vec3 dPdu = vec3(-cosLat * sin(longitude), 0.0, cosLat * cos(longitude)) * uRadius;
  vec3 dPdv = vec3(-sin(latitude) * cos(longitude), cosLat, -sin(latitude) * sin(longitude)) * uRadius;

  // Sampling several pixels away (not the immediate neighbor) smooths out
  // small per-pixel noise instead of amplifying it into visible roughness.
  // TODO(DS): arbitrary placeholder sample spacing.
  float sampleOffset = 16.0 / 1024.0;
  float hL = texture2D(uHeightMap, vUv - vec2(sampleOffset, 0.0)).r;
  float hR = texture2D(uHeightMap, vUv + vec2(sampleOffset, 0.0)).r;
  float hD = texture2D(uHeightMap, vUv - vec2(0.0, sampleOffset)).r;
  float hU = texture2D(uHeightMap, vUv + vec2(0.0, sampleOffset)).r;
  float dHdu = (hR - hL) / (2.0 * sampleOffset);
  float dHdv = (hU - hD) / (2.0 * sampleOffset);

  vec3 tangentU = dPdu + localNormal * dHdu * uDisplacementAmplitude;
  vec3 tangentV = dPdv + localNormal * dHdv * uDisplacementAmplitude;
  vec3 normal = normalize(normalMatrix * cross(tangentV, tangentU));

  // Basic diffuse (Lambertian) lighting: how directly the surface faces the light.
  float diffuse = max(dot(normal, normalize(uLightDirection)), 0.0);

  // Blend between the ambient floor and full diffuse brightness, so the
  // unlit side of the sphere is dim rather than pure black.
  float lighting = uAmbient + diffuse * (1.0 - uAmbient);

  gl_FragColor = vec4(uBaseColor * lighting, 1.0);
}
