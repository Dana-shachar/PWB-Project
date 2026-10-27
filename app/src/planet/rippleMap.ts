import * as THREE from 'three';

// The water's ripple texture (three.js's example waternormals.jpg, in app/public), loaded once and shared by the
// planet's ocean and the chunk's water. Ripples stay off until it has loaded.
const RIPPLE_MAP_URL = `${import.meta.env.BASE_URL}textures/waternormals.jpg`;
let rippleMap: THREE.Texture | null = null;
let rippleMapReady = false;

export function getRippleMap(): THREE.Texture {
  if (!rippleMap) {
    rippleMap = new THREE.TextureLoader().load(RIPPLE_MAP_URL, () => {
      rippleMapReady = true;
    });
    rippleMap.wrapS = THREE.RepeatWrapping;
    rippleMap.wrapT = THREE.RepeatWrapping;
  }
  return rippleMap;
}

export function isRippleMapReady(): boolean {
  return rippleMapReady;
}
