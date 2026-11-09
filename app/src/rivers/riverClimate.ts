// The planet's water budget from two climate numbers, one for the whole planet until Stage 09 gives each place its own.
// Runoff is Budyko's framework in Fu's form; a lake settles where evaporation from its surface meets what flows in.
// Each liquid runs the same formulas across its own temperature range. Ranges inferred, TUNABLE.
const FU_OMEGA = 2.6; // Budyko's original curve in Fu's form (Greve et al. 2016)
const EVAPORATION_PER_RAINFALL = 1100 / 450; // at the reference temperature, over a liquid's typical rainfall: water's. Inferred, TUNABLE
const REFERENCE_SHARE = 0.4375; // how far up a liquid's range that is: water's 15 C
const RANGE_DOUBLINGS = 8; // evaporation doubles this often across a liquid's range: for water, every 10 C. Inferred, TUNABLE
const REFERENCE_RUNOFF_SHARE = 40 / 450; // of a liquid's typical rainfall: there, a flow of 1 means one node's worth of land
const REACH_NODES = 200; // how far a water-thin liquid gets at a cooling rate of 1. Inferred, TUNABLE
const SULFUR_THICKEST_C = 187; // its viscosity peaks here and is low either side (McEwen and Soderblom 1983, Wijns)
const SULFUR_THICKENING = 7; // times water's, added at the peak. Inferred, TUNABLE
const SULFUR_PEAK_WIDTH_C = 40;
const RAINFALL_MAX_SHARE = 26; // the slider's top, over a liquid's typical rainfall: Water's 11,700 mm is about Earth's wettest place (Mawsynram, about 11,800 mm a year). TUNABLE

export interface RiverClimate {
  rainfall: number; // mm a year
  temperature: number; // degrees C
  liquid: string; // a LIQUIDS name
}

export interface WaterBudget {
  lakeShare: number; // a closed lake's area over all the land draining into it, 0 to 1
  flowScale: number; // the water each node of land gives its river, compared to the default climate
  reachKeep: number; // the share of a river's water that survives each node it crosses
  minDrawnFlow: number;
}

export interface Liquid {
  name: string;
  minC: number;
  maxC: number;
  flows: boolean; // false for the worlds where nothing runs: no rivers, no lakes
  frozenBelowC?: number;
  typicalRainfall: number; // mm a year, where the Rainfall slider starts. Water's is tuned, the rest invented: TUNABLE
  // How each liquid differs from water, all chosen for the look, TUNABLE:
  viscosity: number; // times water's: speed falls with it (Jeffreys)
  evaporationStrength: number; // times water's: lower pools more
  coolingRate: number; // how fast it stops: 0 never does (Pinkerton and Wilson's cooling-limited flows)
  channelWidth: number; // times water's, for the valleys
  minDrawnFlow: number; // lower shows finer branches
}

// Ranges follow each liquid's melting and boiling points, widened where that leaves gaps. Inferred, TUNABLE.
const WATER: Liquid = { name: 'Water', minC: -20, maxC: 60, flows: true, typicalRainfall: 450, viscosity: 1, evaporationStrength: 1, coolingRate: 0, channelWidth: 1, minDrawnFlow: 64 };

export const LIQUIDS: Liquid[] = [
  { ...WATER, minC: -270, frozenBelowC: -20 }, // ice below that: lakes keep their shape, nothing flows
  { ...WATER, name: 'Nitrogen', minC: -210, maxC: -196, typicalRainfall: 5, evaporationStrength: 2, channelWidth: 1.5, minDrawnFlow: 32 }, // as on Triton; barely clings on
  { ...WATER, name: 'Methane', minC: -185, maxC: -150, typicalRainfall: 10, channelWidth: 2, minDrawnFlow: 32 }, // wider, gentler rivers (Birch et al. 2023)
  { ...WATER, name: 'Ethane', minC: -150, maxC: -90, typicalRainfall: 10, evaporationStrength: 0.3, channelWidth: 2, minDrawnFlow: 32 }, // far lower vapor pressure
  { ...WATER, name: 'Ammonia', minC: -78, maxC: -33, typicalRainfall: 100, minDrawnFlow: 32 },
  { ...WATER, name: 'Sulfuric acid', minC: 100, maxC: 340, typicalRainfall: 200, viscosity: 3, evaporationStrength: 0.4, minDrawnFlow: 128 }, // inferred, nothing found
  { ...WATER, name: 'Sulfur', minC: 115, maxC: 445, typicalRainfall: 300, coolingRate: 0.25 }, // Io's flows; see viscosityAt
  { ...WATER, name: 'Lava', minC: 700, maxC: 1500, typicalRainfall: 1000, viscosity: 8, evaporationStrength: 2, coolingRate: 1, channelWidth: 3, minDrawnFlow: 32 },
  { ...WATER, name: 'Iron', minC: 1538, maxC: 2800, typicalRainfall: 2000, coolingRate: 4, minDrawnFlow: 32 }, // inferred, nothing found
  { ...WATER, name: 'Dry', minC: 60, maxC: 2800, flows: false },
];

export function liquidNamed(name: string): Liquid {
  return LIQUIDS.find((liquid) => liquid.name === name) ?? LIQUIDS[0];
}

// The coldest it still flows: the slider can go below this for a liquid that freezes.
export function flowingMinC(liquid: Liquid): number {
  return liquid.frozenBelowC ?? liquid.minC;
}

export function rainfallMax(liquid: Liquid): number {
  return liquid.typicalRainfall * RAINFALL_MAX_SHARE;
}

// Where the sliders land on a liquid: water's 15 C, and the same share of the way up any other range.
export function referenceTemperature(liquid: Liquid): number {
  return Math.round(flowingMinC(liquid) + REFERENCE_SHARE * (liquid.maxC - flowingMinC(liquid)));
}

export function viscosityAt(liquid: Liquid, temperature: number): number {
  if (liquid.name !== 'Sulfur') return liquid.viscosity;
  return liquid.viscosity + SULFUR_THICKENING * Math.exp(-(((temperature - SULFUR_THICKEST_C) / SULFUR_PEAK_WIDTH_C) ** 2));
}

// Jeffreys: speed falls with viscosity. A flow stops when it has cooled, so its reach is speed times cooling time.
function reachKeepAt(liquid: Liquid, temperature: number): number {
  if (liquid.coolingRate <= 0) return 1;
  return 1 - (viscosityAt(liquid, temperature) * liquid.coolingRate) / REACH_NODES;
}

export function waterBudget({ rainfall, temperature, liquid: liquidName }: RiverClimate): WaterBudget {
  const liquid = liquidNamed(liquidName);
  if (!liquid.flows || rainfall <= 0 || temperature < flowingMinC(liquid)) return { lakeShare: 0, flowScale: 0, reachKeep: 1, minDrawnFlow: liquid.minDrawnFlow };
  const range = liquid.maxC - flowingMinC(liquid);
  const referenceC = flowingMinC(liquid) + REFERENCE_SHARE * range;
  const evaporationDemand = liquid.evaporationStrength * EVAPORATION_PER_RAINFALL * liquid.typicalRainfall * 2 ** ((temperature - referenceC) / (range / RANGE_DOUBLINGS));
  const aridity = evaporationDemand / rainfall;
  const landEvaporation = rainfall * (1 + aridity - (1 + aridity ** FU_OMEGA) ** (1 / FU_OMEGA));
  const runoff = Math.max(0, rainfall - landEvaporation);
  const lakeLoss = Math.max(0, evaporationDemand - rainfall); // when rain beats evaporation a lake can't shrink, so it spills
  return { lakeShare: runoff > 0 ? runoff / (runoff + lakeLoss) : 0, flowScale: runoff / (REFERENCE_RUNOFF_SHARE * liquid.typicalRainfall), reachKeep: reachKeepAt(liquid, temperature), minDrawnFlow: liquid.minDrawnFlow };
}
