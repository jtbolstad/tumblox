import * as THREE from 'three';
import { BLOCKS } from '../data/blocks';
import type { Level } from '../data/level';
import { THEMES } from '../data/themes';

export interface PreviewScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** spherical orbit params a live viewer can animate `camera` around, keeping it pointed at `lookAt` */
  radius: number;
  height: number;
  lookAt: THREE.Vector3;
  dispose: () => void;
}

/**
 * A light, physics-free 3D scene for a level preview: just its blocks and platform on a flat ground,
 * no world dressing, crowd or shadows. Used for the live PC thumbnail (see live-thumb.ts) - cheap enough
 * to run several at once, unlike the real game scene.
 */
export function buildPreviewScene(level: Level): PreviewScene {
  const scene = new THREE.Scene();
  const theme = THEMES[level.theme];

  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2;
  skyCanvas.height = 32;
  const sg = skyCanvas.getContext('2d') as CanvasRenderingContext2D;
  const grad = sg.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, `#${theme.sky.top.toString(16).padStart(6, '0')}`);
  grad.addColorStop(1, `#${theme.sky.horizon.toString(16).padStart(6, '0')}`);
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 2, 32);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;

  const ambient = new THREE.AmbientLight(0xffffff, 1.2);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(3, 6, 4);
  scene.add(ambient, sun);

  let top = 0;
  let halfWidth = level.platform.size[0] / 2;
  for (const b of level.blocks) {
    top = Math.max(top, b.pos[1] + b.size[1] / 2);
    halfWidth = Math.max(halfWidth, Math.abs(b.pos[0]) + b.size[0] / 2);
  }

  const platformGeo = new THREE.BoxGeometry(level.platform.size[0], 1, level.platform.size[1]);
  const platformMat = new THREE.MeshStandardMaterial({ color: theme.pedestal });
  const platform = new THREE.Mesh(platformGeo, platformMat);
  platform.position.set(0, -0.5, 0);
  scene.add(platform);

  const groundGeo = new THREE.PlaneGeometry(60, 60);
  const groundMat = new THREE.MeshStandardMaterial({ color: theme.ground });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  scene.add(ground);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const blockMats = new Map<number, THREE.MeshStandardMaterial>();
  for (const b of level.blocks) {
    const color = BLOCKS[b.type].color;
    let mat = blockMats.get(color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color });
      blockMats.set(color, mat);
    }
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.scale.set(b.size[0], b.size[1], b.size[2]);
    mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
    mesh.rotation.y = b.rot;
    scene.add(mesh);
  }

  const lookAt = new THREE.Vector3(0, top * 0.4, 0);
  const radius = Math.max(halfWidth * 1.8 + 2, top + 4, 6);
  const height = top * 0.55 + 2.2;
  const camera = new THREE.PerspectiveCamera(42, 120 / 76, 0.1, 100);
  camera.position.set(radius * Math.cos(Math.PI / 4), height, radius * Math.sin(Math.PI / 4));
  camera.lookAt(lookAt);

  return {
    scene,
    camera,
    radius,
    height,
    lookAt,
    dispose: () => {
      platformGeo.dispose();
      platformMat.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      boxGeo.dispose();
      for (const mat of blockMats.values()) mat.dispose();
      skyTex.dispose();
    },
  };
}
