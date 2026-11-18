import { useEffect, useRef, useState } from 'react';
import { PauseIcon, PlayIcon } from '../ui/icons';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SharedViewportRenderer } from '../scene/sharedViewportRenderer';
import { controls } from '../scene/controls';
import { applyTreeGenes, type TreeSpecies } from './treeGenes';
import { TreeBloom } from './treeBloom';
import { applyTreeLook, showFullDetail, updateTreeWind, type TreeLighting } from './treeLook';
import { AlienTree } from './alienTree';

interface TreeViewCanvasProps {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  sharedRenderer: SharedViewportRenderer;
  species: TreeSpecies[];
  landColor: string; // the planet's land color, which the species' hues turn from
  shade: Omit<TreeLighting, 'lightDirection' | 'lightIntensity' | 'ambient' | 'diffuseWrap'>; // the planet's toon shade
  wind: number; // the Atmosphere's Wind, Beaufort 0 to 12
}

// The Tree view's own light, from the same side as its sun lamp below. TUNABLE
const VIEW_LIGHT = { lightDirection: new THREE.Vector3(30, 60, 20), lightIntensity: 1, ambient: 0.55, diffuseWrap: 0.3 };

const TURN_SPEED = 0.6; // OrbitControls' autoRotateSpeed: about one turn every 100 s at 60 fps
const GAP_SHARE = 0.25; // space between neighboring trees around the ring, as a share of the widest one

function disposeTree(tree: AlienTree) {
  tree.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  });
}

// The Tree view: every species whose eye is on, side by side on a ground disc, slowly turning, to tune species in
// isolation as SpeedTree's modeler and EZ-Tree's own app do. Drawn by the shared renderer like the planet and the chunk.
export function TreeViewCanvas({ viewportRef, sharedRenderer, species, landColor, shade, wind }: TreeViewCanvasProps) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const treesRef = useRef(new Map<string, { tree: AlienTree; key: string }>());
  const windRef = useRef(wind);
  windRef.current = wind;
  const framedRef = useRef(''); // the shown species last framed: editing a gene keeps the camera where it is
  const [turning, setTurning] = useState(true);
  const turnBtnRef = useRef<HTMLButtonElement | null>(null);

  // OrbitControls captures the pointer on the viewport's own pointerdown, so a press must stop at the button natively
  // (React's handler runs after the viewport's), or the release lands on the viewport and the click is lost.
  useEffect(() => {
    const btn = turnBtnRef.current;
    if (!btn) return;
    const stop = (event: PointerEvent) => event.stopPropagation();
    btn.addEventListener('pointerdown', stop);
    return () => btn.removeEventListener('pointerdown', stop);
  }, []);

  useEffect(() => {
    if (orbitRef.current) orbitRef.current.autoRotate = turning;
  }, [turning]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202022);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
    camera.position.set(40, 20, 40);
    const orbit = controls(camera, element);
    orbit.autoRotate = turning;
    orbit.autoRotateSpeed = TURN_SPEED;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(30, 60, 20);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshLambertMaterial({ color: 0x3a3a3c }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    sceneRef.current = scene;
    cameraRef.current = camera;
    orbitRef.current = orbit;
    groundRef.current = ground;
    const trees = treesRef.current;
    const clock = new THREE.Clock();
    const bloom = new TreeBloom();
    sharedRenderer.registerView('tree', {
      scene,
      camera,
      elementRef: viewportRef,
      onFrame: () => {
        orbit.update();
        const time = clock.getElapsedTime();
        let glow = 0;
        trees.forEach(({ tree }) => {
          updateTreeWind(tree, time, windRef.current);
          glow = Math.max(glow, (tree.leavesMesh.material as THREE.ShaderMaterial).uniforms?.uGlow?.value ?? 0);
        });
        bloom.setStrength(glow);
      },
      postRender: (renderer, left, bottom, width, height) => bloom.render(renderer, scene, camera, left, bottom, width, height),
    });
    return () => {
      sharedRenderer.unregisterView('tree');
      bloom.dispose();
      orbit.dispose();
      trees.forEach(({ tree }) => disposeTree(tree));
      trees.clear();
      ground.geometry.dispose();
      ground.material.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once; the species effect below adds and regenerates trees
  }, []);

  // Builds or regenerates only the species that changed, lays the visible ones in a row, and frames them all.
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const orbit = orbitRef.current;
    const ground = groundRef.current;
    if (!scene || !camera || !orbit || !ground) return;
    const trees = treesRef.current;
    const shown = species.filter((each) => each.visible);
    for (const [id, entry] of trees) {
      if (!shown.some((each) => each.id === id)) {
        scene.remove(entry.tree);
        disposeTree(entry.tree);
        trees.delete(id);
      }
    }
    for (const each of shown) {
      const key = JSON.stringify([each.genes, landColor, shade]);
      let entry = trees.get(each.id);
      if (!entry) {
        entry = { tree: new AlienTree(), key: '' };
        trees.set(each.id, entry);
        scene.add(entry.tree);
      }
      if (entry.key !== key) {
        applyTreeGenes(entry.tree, each.genes);
        entry.tree.generate();
        applyTreeLook(entry.tree, each.genes, landColor, { ...VIEW_LIGHT, ...shade });
        showFullDetail(entry.tree);
        entry.key = key;
      }
    }
    // Laid out and framed only when the shown set changes: editing a gene leaves every plant and the camera in place.
    const shownKey = shown.map((each) => each.id).join(',');
    if (shownKey === framedRef.current) return;
    framedRef.current = shownKey;

    // A ring on the ground disc, neighbors spaced by the widest footprint, so the turntable shows each in turn.
    const widths = shown.map((each) => {
      const size = new THREE.Box3().setFromObject(trees.get(each.id)!.tree).getSize(new THREE.Vector3());
      return Math.max(size.x, size.z, 1);
    });
    const step = Math.max(1, ...widths) * (1 + GAP_SHARE);
    const ringRadius = shown.length > 1 ? step / (2 * Math.sin(Math.PI / shown.length)) : 0;
    shown.forEach((each, i) => {
      const angle = (i / shown.length) * Math.PI * 2;
      trees.get(each.id)!.tree.position.set(Math.cos(angle) * ringRadius, 0, Math.sin(angle) * ringRadius);
    });
    // Fits the trees' bounding sphere in the narrower of the two view angles, keeping the viewing angle.
    const box = new THREE.Box3();
    trees.forEach(({ tree }) => box.expandByObject(tree));
    if (box.isEmpty()) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 10, 5));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    ground.scale.setScalar(Math.max(sphere.radius * 1.2, 10));
    const halfVertical = THREE.MathUtils.degToRad(camera.fov / 2);
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * Math.max(camera.aspect, 1e-3));
    const distance = (sphere.radius / Math.sin(Math.min(halfVertical, halfHorizontal))) * 1.05;
    const direction = camera.position.clone().sub(orbit.target).normalize();
    orbit.target.copy(sphere.center);
    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    camera.far = distance * 4;
    camera.updateProjectionMatrix();
  }, [species, landColor, shade]);

  return (
    <button
      type="button"
      className={'gumball-btn gumball-btn--square tree-view-turn-btn' + (turning ? ' gumball-btn--active' : '')}
      title={turning ? 'Stop turning' : 'Turn the trees'}
      aria-label={turning ? 'Stop turning' : 'Turn the trees'}
      aria-pressed={turning}
      ref={turnBtnRef}
      onClick={() => setTurning((on) => !on)}
    >
      {turning ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
}
