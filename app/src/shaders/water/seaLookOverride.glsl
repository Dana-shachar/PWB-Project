// Per-pixel stand-ins for the sea's wave look (oceanWaves.glsl), for a shader that draws both the sea and lakes, each with
// its own controls. chunkWater.frag.glsl sets them at the start of main.
#define SEA_LOOK_OVERRIDE
float gSeaIterations;
float gSeaShine;
float gSeaReflection;
float gSeaWaveScale;
#define SEA_ITERATIONS gSeaIterations
#define SEA_SHINE gSeaShine
#define SEA_REFLECTION gSeaReflection
#define SEA_WAVE_SCALE gSeaWaveScale
