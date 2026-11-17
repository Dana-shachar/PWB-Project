import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';

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
export class AlienTree extends Tree {
  leafSpots: LeafSpot[] = [];
  private leafSections: BranchSection[] = []; // the branch whose leaves are being placed; empty for tip leaves

  generate(): void {
    this.leafSpots = [];
    super.generate();
  }

  generateLeaves(sections: BranchSection[]): void {
    this.leafSections = sections;
    super.generateLeaves(sections);
    this.leafSections = [];
  }

  generateLeaf(origin: THREE.Vector3, orientation: THREE.Euler): void {
    const variance = this.options.leaves.sizeVariance;
    const size = this.options.leaves.size * (1 + this.rng.random(variance, -variance));
    this.leafSpots.push({
      origin: origin.clone(),
      orientation: new THREE.Quaternion().setFromEuler(orientation),
      size,
      seed: Math.floor(this.rng.random() * 4294967296),
      branchRadius: radiusAt(origin, this.leafSections),
    });
  }
}
