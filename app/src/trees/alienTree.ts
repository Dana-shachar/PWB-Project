import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';

export interface LeafSpot {
  origin: THREE.Vector3;
  orientation: THREE.Quaternion;
  size: number;
  seed: number; // this leaf's own variation (trees/leafParts.ts)
}

// EZ-Tree's tree with its leaf step taken over: generateLeaf (a public method) records where each leaf goes, at the
// size and angle EZ-Tree picks, and trees/treeLook.ts builds our 3D leaf parts there instead of its photo cards.
export class AlienTree extends Tree {
  leafSpots: LeafSpot[] = [];

  generate(): void {
    this.leafSpots = [];
    super.generate();
  }

  generateLeaf(origin: THREE.Vector3, orientation: THREE.Euler): void {
    const variance = this.options.leaves.sizeVariance;
    const size = this.options.leaves.size * (1 + this.rng.random(variance, -variance));
    this.leafSpots.push({
      origin: origin.clone(),
      orientation: new THREE.Quaternion().setFromEuler(orientation),
      size,
      seed: Math.floor(this.rng.random() * 4294967296),
    });
  }
}
