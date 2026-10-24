import * as THREE from 'three';
import { playBoom } from '../audio/audio';
import type { Puffs, ShellKind, Sparks } from './fx';

interface Rocket {
  /** when it lifts off, performance.now() */
  at: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  start: number | null;
  kind: ShellKind;
  colors: THREE.Color[];
}

const FIREWORK_COLORS = [0xff4d6d, 0xffd23f, 0x4dabff, 0x5eead4, 0xff8c42, 0xc084fc, 0xffffff, 0xa3e635];
const ROCKET_SECONDS = 0.7;

/** Rockets climb in front of the camera and burst into glowing sparks: the title/victory celebration. */
export function createFireworks(deps: { camera: THREE.Camera; sparks: Sparks; glow: Puffs }) {
  const { camera, sparks, glow } = deps;
  const rockets: Rocket[] = [];
  const fireworkAxis = new THREE.Vector3();
  const rocketAt = new THREE.Vector3();
  const rocketColor = new THREE.Color(0xffd9a0);

  /** `platformTop`: rockets launch from no higher than this, so they climb up into view. */
  function celebrate(shells: number, platformTop: number) {
    const now = performance.now();
    const pick = () => new THREE.Color(FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)]);
    const kinds: ShellKind[] = ['peony', 'peony', 'ring', 'willow'];
    for (let i = 0; i < shells; i++) {
      // a point in the view between the camera and the island; the rocket climbs to it from below
      const to = new THREE.Vector3();
      camera
        .getWorldDirection(to)
        .multiplyScalar(6 + Math.random() * 9)
        .add(camera.position);
      fireworkAxis.set(1, 0, 0).applyQuaternion(camera.quaternion);
      to.addScaledVector(fireworkAxis, (Math.random() - 0.5) * 14);
      to.y += 1 + Math.random() * 5;
      const from = to.clone();
      from.y = Math.min(to.y - 6, platformTop);
      from.x += (Math.random() - 0.5) * 2;
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const colors = kind === 'willow' ? [new THREE.Color(0xffc857)] : [pick(), pick()];
      rockets.push({ at: now + 150 + i * 170 + Math.random() * 200, from, to, start: null, kind, colors });
    }
  }

  function updateFireworks(now: number) {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      if (now < r.at) continue;
      r.start ??= now;
      const t = Math.min((now - r.start) / (ROCKET_SECONDS * 1000), 1);
      rocketAt.lerpVectors(r.from, r.to, 1 - (1 - t) ** 2); // slows as it climbs
      sparks.tail(rocketAt, rocketColor);
      if (t < 1) continue;
      rockets.splice(i, 1);
      glow.emit(r.to, { color: 0xfff1c1, size: [1.2, 5], life: 0.25, alpha: 0.9 });
      sparks.burst(r.to, r.kind, r.colors, r.kind === 'ring' ? 60 : 150, r.kind === 'willow' ? 6 : 9);
      if (Math.random() < 0.35) playBoom(); // a few thumps, not every shell
    }
  }

  function resetFireworks() {
    rockets.length = 0;
  }

  return { celebrate, updateFireworks, resetFireworks };
}
