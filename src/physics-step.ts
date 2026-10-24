import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { type ImpactKind, playBoom, playImpact, playNote, playVanish } from './audio';
import { BLOCKS, type BlockType } from './blocks';
import type { createCrowd } from './crowd';
import type { BallEntity, Blaster, BlockEntity, CharacterEntity, Owner } from './entities';
import type { Debris, Particles, Puffs, Shake, Shockwaves } from './fx';
import { exciteMusic } from './music';
import { CHAIN_WINDOW, chainBonus } from './rules';
import { TOOLS } from './tools';
import type { createUi } from './ui';

const BLAST_RADIUS = 3.2;
const BLAST_DELTA_V = 9; // m/s at the centre of an explosion
const CHAIN_DELAY = 0.15; // s between a blast and the bombs it sets off
const HIT_COOLDOWN = 0.2; // s before the same multi-hit block can lose another hit
const BOMB_BALL_TRIGGER_SPEED = 3; // m/s
const FIREWORK_LAUNCH_SPEED = 14; // m/s upward
const FIREWORK_FUSE = 0.7; // s from launch to burst
const DUST_SPEED = 4; // m/s impact that kicks up dust
const SQUASH_SPEED = 4; // m/s ball hit that squashes the block

const IMPACT_BY_TYPE: Partial<Record<BlockType, ImpactKind>> = {
  wood: 'wood',
  steel: 'metal',
  gem: 'glass',
  ice: 'glass',
};

/** A random unit vector, written into `out`. */
export function randomDir(out: THREE.Vector3) {
  return out.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
}

type Crowd = ReturnType<typeof createCrowd>;

/**
 * Blasts, fireworks, bombs and impacts: the per-tick work that follows a physics step. Owns the
 * pending blasts and launches, the chain counter and the slow-mo clock; what a blast or impact
 * *costs* or *scores* stays in main.ts, reached through `addBonus`, and the rest of the world
 * (entity arrays, collider lookup, fx, crowd) is passed in. main.ts still runs `stepPhysics`
 * and calls `processPending` and `handleImpacts` once per step.
 */
export function createPhysicsStep(deps: {
  world: RAPIER.World;
  events: RAPIER.EventQueue;
  colliderOwner: Map<number, Owner>;
  blocks: BlockEntity[];
  balls: BallEntity[];
  chars: CharacterEntity[];
  jingleNotes: number[];
  getSimTime: () => number;
  getFrameNow: () => number;
  getExtras: () => boolean;
  particles: Particles;
  smoke: Puffs;
  glow: Puffs;
  shockwaves: Shockwaves;
  debris: Debris;
  shake: Shake;
  ui: Pick<ReturnType<typeof createUi>, 'callout'>;
  crowdCheer: Crowd['crowdCheer'];
  bonk: Crowd['bonk'];
  isSpectator: Crowd['isSpectator'];
  hitReaction: (c: CharacterEntity) => void;
  removeBlock: (e: BlockEntity) => void;
  removeBallBody: (e: BallEntity) => void;
  addBonus: (n: number) => void;
}) {
  const {
    world,
    events,
    colliderOwner,
    blocks,
    balls,
    chars,
    jingleNotes,
    getSimTime,
    getFrameNow,
    getExtras,
    particles,
    smoke,
    glow,
    shockwaves,
    debris,
    shake,
    ui,
    crowdCheer,
    bonk,
    isSpectator,
    hitReaction,
    removeBlock,
    removeBallBody,
    addBonus,
  } = deps;

  const pendingBlasts: { entity: Blaster; at: number }[] = [];
  const pendingLaunches: { entity: BlockEntity; at: number }[] = []; // fireworks waiting to lift off
  let chainLength = 0;
  let lastBlastAt = Number.NEGATIVE_INFINITY;
  let slowUntil = 0; // performance.now() time until which the sim runs in slow motion

  function scheduleBlast(e: Blaster, delay: number) {
    if (e.exploding || ('status' in e && e.status === 'removed')) return;
    e.exploding = true;
    pendingBlasts.push({ entity: e, at: getSimTime() + delay });
  }

  /** Launch a fireworks block upward; it bursts after the fuse. */
  function ignite(e: BlockEntity, delay = 0) {
    if (e.exploding || e.status === 'removed') return;
    pendingLaunches.push({ entity: e, at: getSimTime() + delay });
    scheduleBlast(e, delay + FIREWORK_FUSE);
  }

  const blastCenter = new THREE.Vector3();
  const blastDir = new THREE.Vector3();
  const puffVel = new THREE.Vector3();
  const puffPos = new THREE.Vector3();

  /** Flash, shockwave, smoke and chunky debris: the look of one blast. */
  function blastEffects(at: THREE.Vector3, color: number) {
    const extras = getExtras();
    glow.emit(at, { color: 0xfff1c1, size: [1.5, BLAST_RADIUS * 2.2], life: 0.18, alpha: 1 });
    glow.emit(at, { color: 0xffa94d, size: [1, BLAST_RADIUS * 1.6], life: 0.35, alpha: 0.9 });
    shockwaves.spawn(at, BLAST_RADIUS * 1.2);
    const puffs = extras ? 10 : 4;
    for (let i = 0; i < puffs; i++) {
      puffPos.copy(at).addScaledVector(randomDir(puffVel), 0.6);
      randomDir(puffVel).multiplyScalar(3).y += 1.5;
      smoke.emit(puffPos, {
        color: i % 2 === 0 ? 0x8d8d8d : 0x5c5c5c,
        size: [1, 2.6 + Math.random()],
        life: 1.1 + Math.random() * 0.6,
        alpha: 0.7,
        velocity: puffVel,
      });
    }
    debris.burst(at, [color, 0x3a3a3a, 0xffa94d], extras ? 16 : 8, 8);
    particles.burst(at, 0xffd166, 24, 9);
  }

  /** Count chained blasts; from the third on, award a bonus, call it out and slow time so it reads. */
  function countChain() {
    chainLength = getSimTime() - lastBlastAt <= CHAIN_WINDOW ? chainLength + 1 : 1;
    lastBlastAt = getSimTime();
    const gained = chainBonus(chainLength);
    if (gained === 0) return;
    addBonus(gained);
    exciteMusic();
    crowdCheer(2.5);
    ui.callout(`Chain ×${chainLength}!`, `+${gained}`);
    slowUntil = getFrameNow() + 1000;
  }

  function detonate(source: Blaster) {
    blastCenter.copy(source.currPos);
    blastEffects(blastCenter, 'type' in source ? BLOCKS[source.type].color : TOOLS[source.tool].color);
    countChain();
    shake.kick(0.35 + 0.05 * Math.min(chainLength, 6));
    playBoom();
    if ('type' in source) {
      removeBlock(source);
    } else {
      const i = balls.indexOf(source);
      if (i >= 0) balls.splice(i, 1);
      removeBallBody(source);
    }
    const targets: Owner[] = [...blocks, ...balls, ...chars];
    for (const t of targets) {
      if (t === source || ('status' in t && t.status === 'removed')) continue;
      if ('type' in t && !BLOCKS[t.type].mobile) continue;
      blastDir.copy(t.currPos).sub(blastCenter);
      const d = blastDir.length();
      if (d > BLAST_RADIUS) continue;
      if ('type' in t) {
        const behaviour = BLOCKS[t.type].behaviour;
        if (behaviour === 'explode') scheduleBlast(t, CHAIN_DELAY);
        else if (behaviour === 'fireworks') ignite(t, CHAIN_DELAY);
      }
      const falloff = 1 - d / BLAST_RADIUS;
      blastDir.y += 0.35; // blasts lift as well as push
      blastDir.normalize().multiplyScalar(BLAST_DELTA_V * falloff * t.body.mass());
      t.body.applyImpulse(blastDir, true);
    }
  }

  function bodySpeed(handle: number): number {
    const parent = world.getCollider(handle)?.parent();
    if (!parent) return 0;
    const v = parent.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  function impactKind(a: Owner | undefined, b: Owner | undefined): ImpactKind {
    for (const e of [a, b])
      if (e && 'type' in e && IMPACT_BY_TYPE[e.type]) return IMPACT_BY_TYPE[e.type] as ImpactKind;
    return 'thud';
  }

  /** Run a block's behaviour for an impact of `speed` m/s; `a` and `b` are the two colliding entities. */
  function triggerBlock(
    e: BlockEntity,
    speed: number,
    a: Owner | undefined,
    b: Owner | undefined,
    toVanish: Set<BlockEntity>,
  ) {
    const def = BLOCKS[e.type];
    if (speed < (def.triggerSpeed ?? 0)) return;
    if (def.behaviour === 'explode') {
      scheduleBlast(e, 0);
    } else if (def.behaviour === 'chemical') {
      // only a chemical-on-chemical touch sets it off
      if (a && b && 'type' in a && 'type' in b && a.type === 'chemical' && b.type === 'chemical') {
        scheduleBlast(e, 0);
      }
    } else if (def.behaviour === 'fireworks') {
      ignite(e);
    } else if (def.behaviour === 'float') {
      e.body.setGravityScale(def.gravityScale ?? -0.25, true); // stays put until something disturbs it
    } else if (def.behaviour === 'jingle' && getSimTime() - e.lastHit > HIT_COOLDOWN) {
      e.lastHit = getSimTime();
      playNote(jingleNotes[e.note]);
    } else if (def.behaviour === 'vanish' && getSimTime() - e.lastHit > HIT_COOLDOWN) {
      e.lastHit = getSimTime();
      e.hitsLeft--;
      if (e.hitsLeft <= 0) toVanish.add(e);
    }
  }

  function vanishAll(toVanish: Set<BlockEntity>) {
    for (const e of toVanish) {
      for (let i = 0; i < 5; i++) {
        puffPos.copy(e.currPos).addScaledVector(randomDir(puffVel), 0.3);
        smoke.emit(puffPos, {
          color: i % 2 === 0 ? BLOCKS[e.type].color : 0xffffff,
          size: [0.6, 1.8],
          life: 0.5,
          alpha: 0.8,
          velocity: randomDir(puffVel).multiplyScalar(2),
        });
      }
      particles.burst(e.currPos, BLOCKS[e.type].color, 8, 4);
      playVanish();
      removeBlock(e);
    }
  }

  let lastDust = 0;

  /** Dust where a block lands hard, and a quick squash on blocks a ball smacks into. */
  function impactEffects(a: Owner | undefined, b: Owner | undefined, speed: number) {
    const ballHit = (a && 'tool' in a) || (b && 'tool' in b);
    for (const e of [a, b]) {
      if (!e || !('type' in e)) continue;
      if (ballHit && speed >= SQUASH_SPEED) e.squash = 1;
    }
    const now = performance.now();
    if (now - lastDust < 60) return; // a collapse fires dozens of contacts at once
    lastDust = now;
    const lander = [a, b].find((e): e is BlockEntity => !!e && 'type' in e);
    if (!lander) return;
    puffPos.copy(lander.currPos);
    puffPos.y -= lander.size.y / 2;
    for (let i = 0; i < 3; i++) {
      smoke.emit(puffPos, {
        color: 0xe3d5b8,
        size: [0.4, 1.2 + Math.min(speed / 10, 1)],
        life: 0.6,
        alpha: 0.55,
        velocity: puffVel.set(Math.random() - 0.5, 0.3, Math.random() - 0.5).multiplyScalar(2.5),
      });
    }
  }

  function handleImpacts() {
    const toVanish = new Set<BlockEntity>();
    events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = colliderOwner.get(h1);
      const b = colliderOwner.get(h2);
      // post-solve speed of the faster body; resting contacts stay far below the thresholds
      const speed = Math.max(bodySpeed(h1), bodySpeed(h2));
      if (speed >= 1.5) playImpact(impactKind(a, b), speed);
      if (speed >= DUST_SPEED) impactEffects(a, b, speed);
      for (const e of [a, b]) {
        if (!e || !('rig' in e) || speed < 3) continue;
        if (isSpectator(e)) {
          if ([a, b].some((o) => o && 'tool' in o)) bonk(e); // only a ball hit counts as a bonk
        } else {
          hitReaction(e);
        }
      }
      const blocksHit = [a, b].filter(
        (e): e is BlockEntity => !!e && 'type' in e && !!BLOCKS[e.type].behaviour,
      );
      const bombBall = [a, b].find((e): e is BallEntity => !!e && 'tool' in e && !!TOOLS[e.tool].explodes);
      if (blocksHit.length === 0 && !bombBall) return;
      if (bombBall && speed >= BOMB_BALL_TRIGGER_SPEED) scheduleBlast(bombBall, 0);
      for (const e of blocksHit) triggerBlock(e, speed, a, b, toVanish);
    });
    vanishAll(toVanish);
  }

  /** Fireworks lift off and due blasts go off; called once per physics step, after the impacts. */
  function processPending(simTime: number) {
    for (let i = pendingLaunches.length - 1; i >= 0; i--) {
      if (pendingLaunches[i].at > simTime) continue;
      const [due] = pendingLaunches.splice(i, 1);
      if (due.entity.status !== 'removed') {
        const v = due.entity.body.linvel();
        due.entity.body.setLinvel({ x: v.x, y: FIREWORK_LAUNCH_SPEED, z: v.z }, true);
      }
    }
    for (let i = pendingBlasts.length - 1; i >= 0; i--) {
      if (pendingBlasts[i].at <= simTime) {
        const [due] = pendingBlasts.splice(i, 1);
        detonate(due.entity);
      }
    }
  }

  return {
    scheduleBlast,
    ignite,
    triggerBlock,
    vanishAll,
    handleImpacts,
    processPending,
    hasPending: () => pendingBlasts.length > 0 || pendingLaunches.length > 0,
    hasPendingBlasts: () => pendingBlasts.length > 0,
    clearPending() {
      pendingBlasts.length = 0;
      pendingLaunches.length = 0;
    },
    getSlowUntil: () => slowUntil,
    /** A new attempt starts: the next blast begins a fresh chain. */
    resetChain() {
      chainLength = 0;
      lastBlastAt = Number.NEGATIVE_INFINITY;
    },
  };
}
