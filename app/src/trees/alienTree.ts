import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';

type Branch = Parameters<Tree['generateBranch']>[0];

export interface LeafSpot {
  origin: THREE.Vector3;
  orientation: THREE.Quaternion;
  size: number;
  seed: number; // this leaf's own variation (trees/leafParts.ts)
  branchRadius: number; // the branch's radius where the leaf sits, so the part's base matches it ([B197])
}

interface BranchSection {
  origin: THREE.Vector3;
  orientation: THREE.Euler;
  radius: number;
}

// The branch radius at a point on the branch's center line, interpolated between its two sections as EZ-Tree does.
function radiusAt(point: THREE.Vector3, sections: BranchSection[]): number {
  let best = Infinity;
  let radius = 0;
  const segment = new THREE.Line3();
  const closest = new THREE.Vector3();
  for (let i = 0; i < sections.length - 1; i++) {
    segment.set(sections[i].origin, sections[i + 1].origin);
    const share = segment.closestPointToPointParameter(point, true);
    const dist = segment.at(share, closest).distanceToSquared(point);
    if (dist < best) {
      best = dist;
      radius = THREE.MathUtils.lerp(sections[i].radius, sections[i + 1].radius, share);
    }
  }
  return radius;
}

// EZ-Tree's tree with its leaf step taken over: generateLeaf (a public method) records where each leaf goes, at the
// size and angle EZ-Tree picks, and trees/treeLook.ts builds our 3D leaf parts there instead of its photo cards.
const GROUND_CLIMB = 0.35; // a sunk limb's rise per unit forward as it climbs back to the ground (about 20 degrees)

export class AlienTree extends Tree {
  leafSpots: LeafSpot[] = [];
  private leafSections: BranchSection[] = []; // the branch whose leaves are being placed; empty for tip leaves

  private lastOrigin: THREE.Vector3 | null = null; // the previous section's origin on the branch being grown

  generate(): void {
    this.leafSpots = [];
    // EZ-Tree's trellis force runs once per section; with no trellis drawn, it's our ground (calculateTrellisForce).
    this.options.trellis.enabled = true;
    this.options.trellis.visible = false;
    super.generate();
    // The thinnest twigs turn by force / radius, faster than leveling can catch: what still reaches under lies on top.
    const position = this.branchesMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) if (position.getY(i) < 0) position.setY(i, 0);
    position.needsUpdate = true;
    this.branchesMesh.geometry.computeBoundingBox();
    this.branchesMesh.geometry.computeBoundingSphere();
    for (const spot of this.leafSpots) spot.origin.y = Math.max(spot.origin.y, 0);
  }

  generateBranch(branch: Branch): void {
    // A limb starting at the ground and pointing into it starts level instead.
    const direction = new THREE.Vector3(0, 1, 0).applyEuler(branch.orientation);
    if (direction.y < 0 && branch.origin.y <= branch.radius) {
      direction.y = 0;
      if (direction.lengthSq() < 1e-8) direction.set(1, 0, 0);
      branch.orientation.setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    }
    this.lastOrigin = branch.origin.clone();
    super.generateBranch(branch);
  }

  // EZ-Tree knows no ground: a limb heading down within its own radius of it turns level and runs along it, as a
  // creeping stem lies on the soil; one whose underside is already in it climbs back. Climb angle inferred, TUNABLE.
  calculateTrellisForce(position: THREE.Vector3, radius: number): { direction: THREE.Vector3; strength: number } | null {
    const prev = this.lastOrigin;
    this.lastOrigin = position.clone();
    if (!prev) return null;
    const heading = position.clone().sub(prev);
    // Looks one section ahead on the same heading, so the turn comes before the dip, not after.
    if (heading.y >= 0 || position.y + heading.y > radius) return null;
    heading.y = 0;
    if (heading.lengthSq() < 1e-8) heading.set(1, 0, 0);
    heading.normalize();
    if (position.y < radius) heading.y = GROUND_CLIMB; // its underside is in the ground: climb until it rests on it
    return { direction: heading.normalize(), strength: Math.PI }; // a full turn: the next section points exactly there
  }

  generateLeaves(sections: BranchSection[]): void {
    this.leafSections = sections;
    super.generateLeaves(sections);
    this.leafSections = [];
  }

  generateLeaf(origin: THREE.Vector3, orientation: THREE.Euler): void {
    // Size range as a factor: size times (1 + range) to a power from -1 to 1, as even smaller as larger, never below 0.
    const range = this.options.leaves.sizeVariance;
    const size = this.options.leaves.size * Math.pow(1 + range, this.rng.random(1, -1));
    this.leafSpots.push({
      origin: origin.clone(),
      orientation: new THREE.Quaternion().setFromEuler(orientation),
      size,
      seed: Math.floor(this.rng.random() * 4294967296),
      branchRadius: radiusAt(origin, this.leafSections),
    });
  }
}
