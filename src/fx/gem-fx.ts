import * as THREE from 'three';
import { BLOCKS, type BlockType } from '../data/blocks';
import { TOOLS } from '../data/tools';
import type { BallEntity, BlockEntity } from '../runtime/entities';
import { randomDir } from '../runtime/physics-step';
import type { Puffs } from './fx';

const SPARKLE_INTERVAL = 0.07; // s between gem glints
const TRAIL_SPEED = 6; // m/s above which balls leave a trail

/** The precious block types: they throb with light and throw off glints, in their own colours. */
const SHINY: Partial<Record<BlockType, { glint: [number, number]; glow: [number, number] }>> = {
  gem: { glint: [0xffffff, 0xbfe4ff], glow: [0.3, 0.8] },
  point: { glint: [0xfff6c9, 0xffe066], glow: [0.1, 0.45] },
};

/** `speedOf`/`radiusScale` are passed as functions rather than values so this module always reads
 *  the current ones, the way other extracted modules read live main.ts state through getters. */
export function createGemFx(deps: {
  glow: Puffs;
  blocks: BlockEntity[];
  balls: BallEntity[];
  getExtras: () => boolean;
  speedOf: (body: import('@dimforge/rapier3d-compat').RigidBody) => number;
  getRadiusScale: () => number;
}) {
  const { glow, blocks, balls, getExtras, speedOf, getRadiusScale } = deps;

  const shinyMats: { mat: THREE.MeshStandardMaterial; type: BlockType }[] = []; // every such material in play
  const sparklePos = new THREE.Vector3();
  let sparkleClock = 0;
  let gemClock = 0;
  const trailPos = new THREE.Vector3();
  const trailDir = new THREE.Vector3();

  /** Called once per shiny material created, so it throbs along with the rest. */
  function registerShiny(mat: THREE.MeshStandardMaterial, type: BlockType) {
    shinyMats.push({ mat, type });
  }

  /** A level reload starts over: materials are shared by type, but the level's own set is rebuilt. */
  function resetShiny() {
    shinyMats.length = 0;
  }

  /** Gems throb with light and throw off bright glints, so they read as precious at a glance. */
  function sparkleGems(dt: number) {
    gemClock += dt;
    const pulse = 0.5 + 0.5 * Math.sin(gemClock * 3.2);
    for (const { mat, type } of shinyMats) {
      const shiny = SHINY[type];
      if (!shiny) continue;
      mat.emissive.set(BLOCKS[type].color);
      mat.emissiveIntensity = shiny.glow[0] + pulse * (shiny.glow[1] - shiny.glow[0]);
    }
    if (!getExtras()) return;
    sparkleClock += dt;
    if (sparkleClock < SPARKLE_INTERVAL) return;
    sparkleClock = 0;
    const gems = blocks.filter((b) => SHINY[b.type] && b.status !== 'removed');
    if (gems.length === 0) return;
    const gem = gems[Math.floor(Math.random() * gems.length)];
    const colors = SHINY[gem.type]?.glint ?? [0xffffff, 0xffffff];
    sparklePos
      .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .multiply(gem.size)
      .multiplyScalar(1.1)
      .add(gem.currPos);
    const big = Math.random() < 0.25; // now and then a big flash
    glow.emit(sparklePos, {
      color: colors[Math.random() < 0.5 ? 0 : 1],
      size: big ? [0.9, 0.05] : [0.5, 0.05],
      life: big ? 0.7 : 0.5,
      alpha: 1,
    });
  }

  /** White streak behind fast balls and glints off gems that are flying. */
  function updateTrails() {
    if (!getExtras()) return;
    for (const b of balls) {
      if (speedOf(b.body) < TRAIL_SPEED) continue;
      const r = TOOLS[b.tool].radius * getRadiusScale();
      glow.emit(b.mesh.position, { color: 0xffffff, size: [r * 1.6, r * 0.3], life: 0.25, alpha: 0.35 });
    }
    for (const g of blocks) {
      if (g.type !== 'gem' || g.status === 'removed' || g.body.isSleeping()) continue;
      if (speedOf(g.body) < 3 || Math.random() < 0.5) continue;
      trailPos.copy(g.currPos).addScaledVector(randomDir(trailDir), 0.5);
      glow.emit(trailPos, { color: 0xffffff, size: [0.3, 0.05], life: 0.4, alpha: 0.9 });
    }
  }

  return { SHINY, registerShiny, resetShiny, sparkleGems, updateTrails };
}
