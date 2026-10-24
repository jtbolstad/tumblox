import * as THREE from 'three';
import { box, cone, merge, p } from './props';

const FLAP_SPEED = 7; // rad/s
const FLAP_AMPLITUDE = 0.8;

/** A big bird, built once and reused: a stubby body, a beak, and two flapping wing pivots. */
function buildBird(): { group: THREE.Group; wingL: THREE.Group; wingR: THREE.Group } {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
  const bodyGeo = merge([
    p(box(3, 0.9, 0.9), 0x332d2d, [0, 0, 0]),
    p(cone(0.4, 1, 4), 0xf2a33a, [1.8, -0.05, 0], [0, 0, -Math.PI / 2]),
  ]) as THREE.BufferGeometry;
  const wingGeo = merge([p(box(4.2, 0.12, 1.5), 0x474040, [0, 0, 0.8])]) as THREE.BufferGeometry;
  const group = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, mat);
  const wingL = new THREE.Group();
  wingL.position.set(0, 0.05, 0.4);
  wingL.add(new THREE.Mesh(wingGeo, mat));
  const wingR = new THREE.Group();
  wingR.position.set(0, 0.05, -0.4);
  const wingRMesh = new THREE.Mesh(wingGeo, mat);
  wingRMesh.scale.z = -1;
  wingR.add(wingRMesh);
  group.add(body, wingL, wingR);
  group.visible = false;
  return { group, wingL, wingR };
}

/**
 * A rare flourish while a level plays: a big bird wings its way across the far sky in a slow arc,
 * from one side of the island to the other. Purely decorative: no physics, never blocks the view.
 */
export function createSkyEvents(scene: THREE.Scene) {
  const { group, wingL, wingR } = buildBird();
  scene.add(group);
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const pos = new THREE.Vector3();
  let flying = false;
  let t = 0;
  let duration = 0;
  let nextCheck = 10 + Math.random() * 12;

  function startFlight() {
    const angle = Math.random() * Math.PI * 2;
    const r = 55 + Math.random() * 20;
    const height = 30 + Math.random() * 14;
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const span = 70 + Math.random() * 30;
    start
      .copy(side)
      .multiplyScalar(-span / 2)
      .addScaledVector(dir, r)
      .setY(height);
    end
      .copy(side)
      .multiplyScalar(span / 2)
      .addScaledVector(dir, r)
      .setY(height);
    t = 0;
    duration = 12 + Math.random() * 7;
    flying = true;
    group.visible = true;
  }

  function update(dt: number) {
    if (!flying) {
      nextCheck -= dt;
      if (nextCheck <= 0) {
        nextCheck = 20 + Math.random() * 25;
        if (Math.random() < 0.4) startFlight();
      }
      return;
    }
    t += dt;
    const k = t / duration;
    if (k >= 1) {
      flying = false;
      group.visible = false;
      return;
    }
    pos.lerpVectors(start, end, k);
    pos.y += Math.sin(k * Math.PI) * 4; // a gentle arc, rather than a dead-straight line
    group.position.copy(pos);
    group.lookAt(end.x, pos.y, end.z);
    const flap = Math.sin(t * FLAP_SPEED) * FLAP_AMPLITUDE;
    wingL.rotation.x = flap;
    wingR.rotation.x = -flap;
  }

  return { update };
}
