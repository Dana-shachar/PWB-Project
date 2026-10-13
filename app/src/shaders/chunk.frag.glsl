// The land chunk's surface shading. Deliberately the same lighting model as
// the planet's fragment.glsl: ambient floor, plus diffuse by how directly
// the surface faces the light. Same maths, same calibration, so the shared
// Scene controls mean the same thing in both views.
//
// The planet rebuilds its normal from sphere position, since its mesh is a
// smooth sphere and the detail lives in the heightmap. The chunk takes the
// normal straight off the mesh instead, which already carries it: smooth
// per-vertex normals for the smooth style, flat per-face ones for voxel, so
// blocky stays blocky. See ISSUES.md, "Planet mesh and adaptive resolution".
//
// Replaces MeshStandardMaterial, whose physically based response needed
// hand-tuned intensity multipliers to look anything like the planet, and
// which blew the chunk's top surface out to flat white at the shared
// lighting values (Dana, 2026-10-13: "the default light for the flat chunk
// has to change").
uniform vec3 uBaseColor;
uniform vec3 uLightDirection;
uniform float uAmbient;

varying vec3 vNormal;

void main() {
  // Renormalized because interpolating across a triangle shortens it.
  vec3 normal = normalize(vNormal);
  float diffuse = max(dot(normal, normalize(uLightDirection)), 0.0);
  float lighting = uAmbient + diffuse * (1.0 - uAmbient);
  gl_FragColor = vec4(uBaseColor * lighting, 1.0);
}
