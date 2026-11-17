import * as THREE from 'three';

// Leaf parts with volume, after Dana's flora references (#32 to #34, nms-*): tapered tubes along 3D curves (tendrils,
// curls, clubs, cups), as three.js's TubeGeometry builds them (Frenet frames along a curve) with a radius that changes
// along it, the way EZ-Tree tapers its branches; and bent strips (blades, fans, pads). Each leaf rolls its own size,
// bend and twist from a seed, so no two match. Built in a leaf's local frame: base at the origin, growing along +y,
// facing +z (EZ-Tree's leaf card frame). Proportions inferred, TUNABLE.
export type LeafPart = 'tendril' | 'curl' | 'frond' | 'spikes' | 'antler' | 'blade' | 'fan' | 'pad' | 'cup' | 'bulb';

export const LEAF_PART_OPTIONS: { value: LeafPart; label: string }[] = [
  { value: 'tendril', label: 'Tendril' },
  { value: 'curl', label: 'Curl' },
  { value: 'frond', label: 'Frond' },
  { value: 'spikes', label: 'Spikes' },
  { value: 'antler', label: 'Antler' },
  { value: 'blade', label: 'Blade' },
  { value: 'fan', label: 'Fan' },
  { value: 'pad', label: 'Pad' },
  { value: 'cup', label: 'Cup' },
  { value: 'bulb', label: 'Bulb' },
];

// mulberry32: a small seeded random generator, so a species rebuilds its leaves the same every time.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class PartBuilder {
  positions: number[] = [];
  shades: number[] = []; // per-vertex brightness jitter, so leaves of one tree differ a little
  alongs: number[] = []; // per-vertex share from the part's base (0) to its tip (1), for the tip color
  indices: number[] = [];
  private transform = new THREE.Matrix4();
  private shade = 1;
  private alongFrom = 0;
  private alongTo = 1;

  begin(transform: THREE.Matrix4, shade: number) {
    this.transform.copy(transform);
    this.shade = shade;
    this.along(0, 1);
  }

  // The share of the part the next shapes span, base to tip (a stalk 0 to 0.4, its disc 0.4 to 1).
  along(from: number, to: number) {
    this.alongFrom = from;
    this.alongTo = to;
  }

  private vertex(point: THREE.Vector3, share: number): number {
    const world = point.clone().applyMatrix4(this.transform);
    this.positions.push(world.x, world.y, world.z);
    this.shades.push(this.shade);
    this.alongs.push(this.alongFrom + (this.alongTo - this.alongFrom) * share);
    return this.positions.length / 3 - 1;
  }

  // A tube along a curve through the points, its radius at each share of the length; a zero radius closes the tip.
  // `closeBase` caps the first ring with a fan, so a joint never shows an open rim ([B197]).
  tube(points: THREE.Vector3[], radius: (share: number) => number, rings: number, sides: number, closeBase = false) {
    const curve = new THREE.CatmullRomCurve3(points);
    const frames = curve.computeFrenetFrames(rings, false);
    const first = this.positions.length / 3;
    for (let i = 0; i <= rings; i++) {
      const share = i / rings;
      const center = curve.getPointAt(share);
      const r = Math.max(radius(share), 0);
      for (let j = 0; j < sides; j++) {
        const angle = (j / sides) * Math.PI * 2;
        const offset = frames.normals[i].clone().multiplyScalar(Math.cos(angle) * r).addScaledVector(frames.binormals[i], Math.sin(angle) * r);
        this.vertex(center.clone().add(offset), share);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < sides; j++) {
        const a = first + i * sides + j;
        const b = first + i * sides + ((j + 1) % sides);
        const c = a + sides;
        const d = b + sides;
        this.indices.push(a, c, b, b, c, d);
      }
    }
    if (closeBase) {
      const center = this.vertex(curve.getPointAt(0), 0);
      for (let j = 0; j < sides; j++) this.indices.push(center, first + j, first + ((j + 1) % sides));
    }
  }

  // A strip along a curve, its width at each share of the length, folded along its middle by `fold` (a crease).
  strip(points: THREE.Vector3[], width: (share: number) => number, rows: number, fold: number, side = new THREE.Vector3(1, 0, 0)) {
    const curve = new THREE.CatmullRomCurve3(points);
    const first = this.positions.length / 3;
    const tangent = new THREE.Vector3();
    for (let i = 0; i <= rows; i++) {
      const share = i / rows;
      const center = curve.getPointAt(share);
      curve.getTangentAt(share, tangent);
      const across = side.clone().sub(tangent.clone().multiplyScalar(side.dot(tangent))).normalize();
      const facing = new THREE.Vector3().crossVectors(across, tangent).normalize();
      const w = Math.max(width(share), 0) / 2;
      this.vertex(center.clone().addScaledVector(across, -w), share);
      this.vertex(center.clone().addScaledVector(facing, fold * w), share);
      this.vertex(center.clone().addScaledVector(across, w), share);
    }
    for (let i = 0; i < rows; i++) {
      for (let k = 0; k < 2; k++) {
        const a = first + i * 3 + k;
        const b = a + 1;
        const c = a + 3;
        const d = b + 3;
        this.indices.push(a, c, b, b, c, d);
      }
    }
  }

  // A disc facing `normal` around a center, its rim wobbling, cupped toward the normal by `cup` (negative domes it).
  disc(center: THREE.Vector3, normal: THREE.Vector3, radius: number, cup: number, wobble: number, phase: number, segments: number) {
    const facing = normal.clone().normalize();
    const across = new THREE.Vector3(1, 0, 0).cross(facing);
    if (across.lengthSq() < 1e-6) across.set(0, 1, 0).cross(facing);
    across.normalize();
    const along = new THREE.Vector3().crossVectors(facing, across);
    const middle = this.vertex(center, 0);
    const rings = 2;
    const first = this.positions.length / 3;
    for (let ring = 1; ring <= rings; ring++) {
      const share = ring / rings;
      for (let j = 0; j < segments; j++) {
        const angle = (j / segments) * Math.PI * 2;
        const r = radius * share * (1 + wobble * Math.sin(angle * 5 + phase));
        this.vertex(center.clone().addScaledVector(across, Math.cos(angle) * r).addScaledVector(along, Math.sin(angle) * r).addScaledVector(facing, cup * radius * share * share), share);
      }
    }
    for (let j = 0; j < segments; j++) {
      const next = (j + 1) % segments;
      this.indices.push(middle, first + j, first + next);
      const outer = first + segments;
      this.indices.push(first + j, outer + j, first + next, first + next, outer + j, outer + next);
    }
  }
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const between = (random: () => number, min: number, max: number) => min + random() * (max - min);

// EZ-Tree tilts each leaf from its branch by the leaf angle about the leaf's x axis, so in the leaf's own frame the
// branch runs along (0, cos a, -sin a), and +z points down and away: drooping parts bend toward +z. A part's first stretch follows it, so the part grows out of the branch smoothly.
function branchDirection(leafAngleDegrees: number): THREE.Vector3 {
  const a = THREE.MathUtils.degToRad(leafAngleDegrees);
  return v(0, Math.cos(a), -Math.sin(a));
}

const JOINT_STRETCH = 0.15; // share of a part's length over which its base widens from the branch's radius. TUNABLE

// A part's radius starting at the branch's own radius and easing into the part's width over its first stretch,
// as EZ-Tree starts a child branch from its parent's radius ([B197]).
function jointed(radius: (share: number) => number, branchRadius: number): (share: number) => number {
  return (share) => {
    if (share >= JOINT_STRETCH) return radius(share);
    const blend = THREE.MathUtils.smoothstep(share, 0, JOINT_STRETCH);
    return THREE.MathUtils.lerp(branchRadius, radius(share), blend);
  };
}

// Prepends a short lead along the branch, shifting the part's own path to start where the lead ends.
function grownFromBranch(points: THREE.Vector3[], branch: THREE.Vector3, lead: number): THREE.Vector3[] {
  const offset = branch.clone().multiplyScalar(lead);
  return [v(0, 0, 0), offset.clone(), ...points.slice(1).map((point) => point.clone().add(offset))];
}

// Adds one leaf part of `size` in the builder's current frame.
// `up` is the world's up in the leaf's own frame, for parts that level themselves (pads).
export function buildLeafPart(builder: PartBuilder, part: LeafPart, size: number, random: () => number, leafAngle: number, bend: number, branchRadius: number, up: THREE.Vector3) {
  const branch = branchDirection(leafAngle);
  // A tube growing out of the branch: its base matches the branch's radius and is capped.
  const stem = (points: THREE.Vector3[], radius: (share: number) => number, rings: number, sides: number) =>
    builder.tube(points, jointed(radius, branchRadius), rings, sides, true);
  if (part === 'spikes') {
    // Straight sharp cones radiating from one point (#26 spiky crowns): for bushes and spiky trees.
    const count = 5 + Math.floor(random() * 5);
    const spread = between(random, 0.5, 1.1);
    for (let i = 0; i < count; i++) {
      const around = (i / count) * Math.PI * 2 + random() * 0.6;
      const tilt = spread * (0.4 + 0.6 * random());
      const dir = v(Math.sin(tilt) * Math.cos(around), Math.cos(tilt), Math.sin(tilt) * Math.sin(around));
      const length = size * between(random, 0.5, 1);
      const width = size * between(random, 0.04, 0.07);
      stem([v(0, 0, 0), dir.clone().multiplyScalar(length * 0.5), dir.clone().multiplyScalar(length)], (t) => width * (1 - t), 6, 5);
    }
    return;
  }
  if (part === 'antler') {
    // A tapered stem forking twice into pointed tines; for shrubs and odd crowns.
    const stemLength = size * between(random, 0.35, 0.5);
    const width = size * between(random, 0.05, 0.08);
    const fork = v(0, stemLength, 0);
    builder.along(0, 0.4);
    stem(grownFromBranch([v(0, 0, 0), v(0, stemLength * 0.5, 0), fork], branch, size * 0.1), (t) => width * (1 - 0.3 * t), 6, 6);
    builder.along(0.4, 1);
    const forkAt = fork.clone().addScaledVector(branch, size * 0.1);
    for (const side of [-1, 1]) {
      const reach = size * between(random, 0.35, 0.55);
      const lean = between(random, 0.4, 0.8);
      const tip = forkAt.clone().add(v(side * Math.sin(lean) * reach, Math.cos(lean) * reach, between(random, -0.1, 0.1) * size));
      const mid = forkAt.clone().lerp(tip, 0.5).add(v(0, reach * 0.1, 0));
      builder.tube([forkAt, mid, tip], (t) => width * 0.7 * (1 - t), 6, 5);
      const tineStart = forkAt.clone().lerp(tip, 0.55);
      const tineTip = tineStart.clone().add(v(-side * reach * 0.2, reach * 0.4, 0));
      builder.tube([tineStart, tineStart.clone().lerp(tineTip, 0.5), tineTip], (t) => width * 0.45 * (1 - t), 4, 5);
    }
    return;
  }
  if (part === 'frond') {
    // A palm frond (#29, #34): an arching rib with paired pointed leaflets drooping off it, shrinking toward the tip.
    const length = size * between(random, 0.9, 1.3);
    const droop = size * between(random, 0.3, 0.6) * bend;
    const rib = grownFromBranch([v(0, 0, 0), v(0, length * 0.35, droop * 0.1), v(0, length * 0.7, droop * 0.45), v(0, length, droop)], branch, size * 0.08);
    const ribWidth = size * 0.03;
    stem(rib, (t) => ribWidth * (1 - 0.8 * t), 10, 5);
    const curve = new THREE.CatmullRomCurve3(rib);
    const pairs = 7 + Math.floor(random() * 5);
    for (let i = 0; i < pairs; i++) {
      const t = 0.18 + (0.78 * i) / pairs;
      const base = curve.getPointAt(t);
      const along = curve.getTangentAt(t);
      const leaflet = size * between(random, 0.28, 0.4) * (1 - 0.55 * t);
      const width = size * between(random, 0.05, 0.08) * (1 - 0.4 * t);
      builder.along(t, 1);
      for (const side of [-1, 1]) {
        const out = v(side, 0, 0).addScaledVector(along, 0.45).normalize();
        const sag = v(0, -leaflet * between(random, 0.15, 0.35), leaflet * 0.25 * bend);
        const points = [base, base.clone().addScaledVector(out, leaflet * 0.5).addScaledVector(sag, 0.3), base.clone().addScaledVector(out, leaflet).add(sag)];
        builder.strip(points, (u) => width * 2.2 * u ** 0.3 * (1 - u) ** 0.8, 4, 0.4, along);
      }
    }
    return;
  }
  if (part === 'tendril') {
    // A cone bent and twisted into a tentacle, thinning to a point (#33, nms-alien-trees).
    const length = size * between(random, 0.8, 1.4);
    const width = size * between(random, 0.06, 0.12);
    const sway = size * between(random, 0.15, 0.45);
    const twist = between(random, 1, 3.5) * (random() < 0.5 ? -1 : 1);
    const phase = random() * Math.PI * 2;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const angle = phase + twist * t;
      points.push(v(Math.cos(angle) * sway * t ** 1.5, length * t, Math.sin(angle) * sway * t ** 1.5));
    }
    stem(grownFromBranch(points, branch, size * 0.12), (t) => width * (1 - t) ** 1.2, 16, 6);
  } else if (part === 'curl') {
    // A fiddlehead (#32, #34): a stem that rolls into a spiral at its tip, thinning as it winds.
    const stemLength = size * between(random, 0.5, 0.9);
    const roll = size * between(random, 0.18, 0.3);
    const turns = between(random, 1.2, 2);
    const width = size * between(random, 0.05, 0.09);
    const lean = between(random, -0.15, 0.15) * size;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      points.push(v(lean * t * t, stemLength * t, 0));
    }
    const center = v(lean + roll, stemLength, 0);
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const theta = (i / steps) * turns * Math.PI * 2;
      const r = roll * (1 - (0.85 * i) / steps);
      const angle = Math.PI - theta;
      points.push(v(center.x + Math.cos(angle) * r, center.y + Math.sin(angle) * r, (i / steps) * size * 0.05));
    }
    stem(grownFromBranch(points, branch, size * 0.1), (t) => width * (1 - 0.85 * t), 40, 6);
  } else if (part === 'bulb') {
    // A club or bud on a thin stalk, swelling then closing to a point (#34 clubs and buds, #27 pods).
    const length = size * between(random, 0.7, 1.2);
    const width = size * between(random, 0.12, 0.22);
    const bend = size * between(random, -0.2, 0.2);
    const points = [v(0, 0, 0), v(bend * 0.3, length * 0.4, 0), v(bend * 0.7, length * 0.75, 0), v(bend, length, 0)];
    stem(grownFromBranch(points, branch, size * 0.1), (t) => width * (0.15 + 0.85 * Math.sin(Math.PI * Math.min(Math.max((t - 0.35) / 0.65, 0), 1)) ** 0.8), 12, 7);
  } else if (part === 'cup') {
    // A trumpet opening upward (#34 calla cups, #27 bells): a cone widening to an open rim, curving slightly.
    const length = size * between(random, 0.8, 1.2);
    const width = size * between(random, 0.25, 0.4);
    const bend = size * between(random, 0.05, 0.25);
    const points = [v(0, 0, 0), v(0, length * 0.4, bend * 0.2), v(0, length * 0.75, bend * 0.6), v(0, length, bend)];
    stem(grownFromBranch(points, branch, size * 0.1), (t) => width * (0.08 + t ** 1.6), 10, 8);
  } else if (part === 'blade') {
    // A long leaf, pointed, creased along its rib, arching back (#32 fern blades, #34 grass).
    const length = size * between(random, 0.8, 1.3);
    const width = size * between(random, 0.15, 0.3);
    const arch = size * between(random, 0.1, 0.45) * bend;
    const points = [v(0, 0, 0), v(0, length * 0.35, arch * 0.15), v(0, length * 0.7, arch * 0.55), v(0, length, arch)];
    builder.strip(points, (t) => width * 2.2 * t ** 0.4 * (1 - t) ** 0.9, 8, between(random, 0.3, 0.6));
  } else if (part === 'fan') {
    // Narrow pointed fingers spreading from one base, arching out (#34 teal fan, palm fronds).
    const count = 5 + Math.floor(random() * 4);
    const spread = between(random, 1.2, 2);
    for (let i = 0; i < count; i++) {
      const angle = (i / (count - 1) - 0.5) * spread;
      const length = size * between(random, 0.6, 1);
      const width = size * between(random, 0.05, 0.1);
      const dir = v(Math.sin(angle), Math.cos(angle), 0);
      const droop = size * between(random, 0.1, 0.3) * bend;
      const points = [v(0, 0, 0), dir.clone().multiplyScalar(length * 0.4), dir.clone().multiplyScalar(length * 0.75).add(v(0, 0, droop * 0.4)), dir.clone().multiplyScalar(length).add(v(0, 0, droop))];
      builder.strip(points, (t) => width * 2 * t ** 0.3 * (1 - t) ** 0.8, 6, 0.3, v(Math.cos(angle), -Math.sin(angle), 0));
    }
  } else {
    // pad: an umbrella (nms-umbrella-disc-trees): a stalk leaving the branch, turning upward and flaring into the
    // center of a level disc whose rim droops, its edge slightly uneven. Proportions inferred, TUNABLE.
    const stalk = size * between(random, 0.3, 0.6);
    const radius = size * between(random, 0.3, 0.5);
    const width = size * 0.035;
    const lead = branch.clone().multiplyScalar(stalk * 0.35);
    const rise = lead.clone().addScaledVector(up, stalk * 0.35);
    const tip = lead.clone().addScaledVector(up, stalk * 0.65);
    builder.along(0, 0.4);
    stem([v(0, 0, 0), lead, rise, tip], (t) => width * (1 + 2.5 * THREE.MathUtils.smoothstep(t, 0.7, 1)), 10, 6);
    builder.along(0.4, 1);
    builder.disc(tip, up, radius, -between(random, 0.15, 0.35), between(random, 0.03, 0.1), random() * Math.PI * 2, 12);
  }
}
