// Compiles every shader the way three.js does before WebGL sees it, so an error shows here with its line instead of a
// blank view on reload. Uses Khronos's reference compiler, glslangValidator (`brew install glslang`).
// The header below copies three.js's own (WebGLProgram.js: '#version 300 es', the GLSL 3 conversion defines, precision,
// and the built-in uniforms and attributes a ShaderMaterial gets). Run from app/: `node scripts/checkShaders.mjs`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SHADERS = 'src/shaders/';
const read = (file) => readFileSync(SHADERS + file, 'utf8');

const PRECISION = 'precision highp float;\nprecision highp int;\nprecision highp sampler2D;\nprecision highp samplerCube;\n';
const VERTEX_HEADER = `#version 300 es
#define attribute in
#define varying out
#define texture2D texture
${PRECISION}uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;
uniform vec3 cameraPosition;
uniform bool isOrthographic;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
`;
const FRAGMENT_HEADER = `#version 300 es
#define varying in
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
#define texture2D texture
#define textureCube texture
#define texture2DLodEXT textureLod
#define textureCubeLodEXT textureLod
${PRECISION}uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
uniform bool isOrthographic;
`;

// Each material's pieces, in the order the code joins them (keep in step with the .ts files named here).
const MATERIALS = [
  { name: 'planet patch (planet/planetPatchMesh.ts)', vertex: ['terrain/vertex.glsl'], fragment: ['terrain/terrain.glsl', 'terrain/landLayers.glsl', 'water/water.glsl', 'water/oceanWaves.glsl', 'atmosphere/airGround.glsl', 'atmosphere/planetAir.glsl', 'terrain/planetPatch.frag.glsl'] },
  { name: 'planet mesh (planet/mesh.ts)', vertex: ['terrain/vertex.glsl'], fragment: ['terrain/terrain.glsl', 'terrain/fragment.glsl'] },
  { name: 'land chunk (voxel/LandChunkCanvas.tsx)', vertex: ['terrain/chunk.vert.glsl'], fragment: ['terrain/terrain.glsl', 'terrain/landLayers.glsl', 'atmosphere/haze.glsl', 'terrain/chunk.frag.glsl'] },
  { name: 'chunk water (voxel/chunkWater.ts)', vertex: ['water/chunkWater.vert.glsl'], fragment: ['water/seaLookOverride.glsl', 'terrain/terrain.glsl', 'water/water.glsl', 'water/oceanWaves.glsl', 'atmosphere/haze.glsl', 'water/chunkWater.frag.glsl'] },
  { name: 'chunk water walls (voxel/chunkWater.ts)', vertex: ['water/chunkWaterWall.vert.glsl'], fragment: ['terrain/terrain.glsl', 'water/water.glsl', 'atmosphere/haze.glsl', 'water/chunkWaterWall.frag.glsl'] },
  { name: 'planet haze (atmosphere/planetHaze.ts)', vertex: ['atmosphere/planetHaze.vert.glsl'], fragment: ['atmosphere/airGround.glsl', 'atmosphere/planetAir.glsl', 'atmosphere/planetHaze.frag.glsl'] },
  { name: 'planet glow (atmosphere/planetGlow.ts)', vertex: ['atmosphere/planetGlow.vert.glsl'], fragment: ['atmosphere/airGround.glsl', 'atmosphere/planetGlow.frag.glsl'] },
  { name: 'clouds (atmosphere/cloudLayer.ts)', vertex: ['atmosphere/airGround.glsl', 'atmosphere/clouds.vert.glsl'], fragment: ['heightmap/noise.glsl', 'atmosphere/clouds.frag.glsl'] },
  { name: 'sky dome (atmosphere/skyDome.ts)', vertex: ['atmosphere/skyDome.vert.glsl'], fragment: ['atmosphere/skyDome.frag.glsl'] },
  { name: 'grid (scene/grid.ts)', vertex: ['scene/grid.vert.glsl'], fragment: ['scene/grid.frag.glsl'] },
  { name: 'heightmap (map/heightmap.ts)', vertex: ['heightmap/heightmapBrush.vert.glsl'], fragment: ['heightmap/noise.glsl', 'heightmap/erosionFilter3d.glsl', 'heightmap/heightmap.frag.glsl'] },
  { name: 'heightmap, chunk pass (map/heightmap.ts)', defines: '#define CHUNK_PATCH_PASS\n', vertex: ['heightmap/heightmapBrush.vert.glsl'], fragment: ['heightmap/noise.glsl', 'heightmap/erosionFilter3d.glsl', 'heightmap/heightmap.frag.glsl'] },
  { name: 'stroke path (map/heightmap.ts)', vertex: ['heightmap/heightmapBrush.vert.glsl'], fragment: ['heightmap/strokePath.frag.glsl'] },
  { name: 'min/max reduce (map/heightmap.ts)', vertex: ['heightmap/heightmapBrush.vert.glsl'], fragment: ['heightmap/minMaxReduce.frag.glsl'] },
  { name: 'elevation histogram (map/heightmap.ts)', vertex: ['heightmap/elevationHistogram.vert.glsl'], fragment: ['heightmap/elevationHistogram.frag.glsl'] },
  { name: 'stream power seed (rivers/planetDrainage.ts)', vertex: ['heightmap/heightmapBrush.vert.glsl'], fragment: ['erosion/streamPowerSeed.frag.glsl'] },
  { name: 'stream power pass (rivers/planetDrainage.ts)', vertex: ['heightmap/heightmapBrush.vert.glsl'], fragment: ['erosion/streamPowerPlanet.frag.glsl'] },
];

const folder = mkdtempSync(join(tmpdir(), 'shaders-'));
let failures = 0;
for (const material of MATERIALS) {
  for (const [stage, header, parts] of [['vert', VERTEX_HEADER, material.vertex], ['frag', FRAGMENT_HEADER, material.fragment]]) {
    // The defines go after the header's #version line, as three.js puts a material's defines in its prefix.
    const source = header.replace('\n', '\n' + (material.defines ?? '')) + parts.map(read).join('\n');
    const file = join(folder, `shader.${stage}`);
    writeFileSync(file, source);
    try {
      execFileSync('glslangValidator', [file], { encoding: 'utf8' });
    } catch (error) {
      failures++;
      // glslang reports lines in the joined source; name the piece each error line falls in.
      const starts = [];
      let line = header.split('\n').length + (material.defines ? 1 : 0);
      for (const part of parts) {
        starts.push([line, part]);
        line += read(part).split('\n').length;
      }
      const report = (error.stdout || String(error)).replace(/0:(\d+):/g, (_, at) => {
        const lineNumber = Number(at);
        const [start, part] = [...starts].reverse().find(([begin]) => lineNumber >= begin) ?? [0, 'header'];
        return `${part}:${lineNumber - start + 1}:`;
      });
      console.log(`✗ ${material.name}, ${stage}\n${report}`);
    }
  }
}
console.log(failures ? `${failures} shader stage(s) failed.` : `All ${MATERIALS.length} materials compile.`);
process.exit(failures ? 1 : 0);
