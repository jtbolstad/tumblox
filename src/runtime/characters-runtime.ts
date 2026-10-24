import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { playVoice } from '../audio/audio';
import { musicBeat } from '../audio/music';
import { CHARACTERS, CharacterRig, moodFor } from '../characters/characters';
import { missFor, quipFor } from '../characters/quips';
import type { Level } from '../data/level';
import type { ThemeId } from '../data/themes';
import {
  type BallEntity,
  type BlockEntity,
  type CharacterEntity,
  makeEntityBase,
  type Owner,
  type Phase,
  speedOf,
} from './entities';

const GET_UP_DELAY = 1.2; // s lying still on its side before a character gets up
const GET_UP_SECONDS = 0.35; // how long the turn back upright takes, mid-hop
const GET_UP_HOP = 2.6; // m/s upward

// ---------- characters: moods, looking around, voices ----------
const CHAR_VOICE_GAP = 1200; // ms between lines from one character
const ANY_VOICE_GAP = 250; // ms between lines from anyone, so a crowd does not babble
const BALL_NOTICE_DISTANCE = 5; // m
const SHAKE_DISTANCE = 2.2; // m: moving blocks this close make a character panic
const MISS_SOUNDS = ['alert', 'yelp', 'boing'] as const;
/** A ball counts as a near miss when its closest approach is between these distances (m, centre to centre). */
const MISS_MIN = 0.95;
const MISS_MAX = 2.4;
const HIT_VOICES = ['ouch', 'yelp', 'whoa', 'boing'] as const;

/**
 * Character runtime: spawning them into the world, getting them back up, moods and voices, near-miss and
 * hit quips, and the per-frame update. Character *data* (specs, rigs, moods) lives in `characters.ts`.
 * main.ts owns the scene state and passes it in; `loadLevel` calls `spawnCharacter`, `stepPhysics` calls
 * `getUpIfFallenOver`, and the tick loop calls `updateCharacters` and `updateNearMisses`.
 */
export function createCharactersRuntime(deps: {
  world: RAPIER.World;
  scene: THREE.Scene;
  camera: THREE.Camera;
  ui: { bubble: (text: string, x: number, y: number) => void };
  colliderOwner: Map<number, Owner>;
  chars: CharacterEntity[];
  balls: BallEntity[];
  blocks: BlockEntity[];
  crowd: { entity: CharacterEntity }[];
  pendingSleep: RAPIER.RigidBody[];
  getLevelTheme: () => ThemeId;
  step: number;
  getPhase: () => Phase;
  getPhysicsIdle: () => boolean;
}) {
  const {
    world,
    scene,
    camera,
    ui,
    colliderOwner,
    chars,
    balls,
    blocks,
    crowd,
    pendingSleep,
    getLevelTheme,
    step: STEP,
    getPhase,
    getPhysicsIdle,
  } = deps;

  const charUp = new THREE.Vector3();
  const getUpAxis = new THREE.Vector3();
  let lastAnyVoice = 0;
  const lookTarget = new THREE.Vector3();
  const toChar = new THREE.Vector3();
  const ballVel = new THREE.Vector3();
  const lastQuip = new WeakMap<CharacterEntity, number>();
  const bubblePos = new THREE.Vector3();

  /** A character left lying on its side hops and turns back onto its feet. */
  function getUpIfFallenOver(c: CharacterEntity) {
    charUp.set(0, 1, 0).applyQuaternion(c.currRot);
    const w = c.body.angvel();
    const resting = speedOf(c.body) < 0.3 && Math.hypot(w.x, w.y, w.z) < 0.5;
    c.tiltedFor = charUp.y < 0.8 && resting ? c.tiltedFor + STEP : 0;
    if (c.tiltedFor < GET_UP_DELAY) return;
    c.tiltedFor = 0;
    const angle = Math.acos(THREE.MathUtils.clamp(charUp.y, -1, 1));
    getUpAxis.crossVectors(charUp, THREE.Object3D.DEFAULT_UP);
    if (getUpAxis.lengthSq() < 1e-6) getUpAxis.set(1, 0, 0); // upside down: any horizontal axis will do
    getUpAxis.normalize().multiplyScalar(angle / GET_UP_SECONDS);
    c.body.setLinvel({ x: 0, y: GET_UP_HOP, z: 0 }, true);
    c.body.setAngvel(getUpAxis, true);
  }

  function spawnCharacter(spec: Level['characters'][number], top: number) {
    const def = CHARACTERS[spec.kind];
    const [w, h, d] = def.size.map((n) => n * spec.scale) as [number, number, number];
    const [x, y, z] = spec.pos;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y + top + h / 2, z)
        .setRotation({ x: 0, y: Math.sin(spec.rot / 2), z: 0, w: Math.cos(spec.rot / 2) })
        .setAngularDamping(0.3),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
        .setDensity(def.density)
        .setFriction(0.8)
        .setRestitution(0.05)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    pendingSleep.push(body); // like blocks, characters wait asleep until something hits them
    const rig = new CharacterRig(spec.kind, true, getLevelTheme());
    rig.root.scale.setScalar(spec.scale);
    scene.add(rig.root);
    const entity: CharacterEntity = {
      ...makeEntityBase(body, collider),
      kind: spec.kind,
      role: spec.role,
      status: 'alive',
      rig,
      mood: 'idle',
      lastVoice: -1e9,
      tiltedFor: 0,
    };
    chars.push(entity);
    colliderOwner.set(collider.handle, entity);
  }

  function bubbleOver(c: CharacterEntity, text: string) {
    bubblePos.copy(c.currPos);
    bubblePos.y += CHARACTERS[c.kind].size[1] * 0.8;
    bubblePos.project(camera);
    if (bubblePos.z > 1) return;
    ui.bubble(text, ((bubblePos.x + 1) / 2) * innerWidth, ((1 - bubblePos.y) / 2) * innerHeight);
  }

  /** A fast ball flew past close by without touching: "missed me!" */
  function updateNearMisses() {
    if (balls.length === 0) return;
    const bystanders = [...chars, ...crowd.map((s) => s.entity)];
    for (const b of balls) {
      if (b.exploding || speedOf(b.body) < 4) continue;
      b.nearest ??= new Map();
      for (const c of bystanders) {
        const d = b.currPos.distanceTo(c.currPos);
        const best = b.nearest.get(c) ?? Number.POSITIVE_INFINITY;
        if (best < 0) continue;
        if (d < best) {
          b.nearest.set(c, d);
        } else if (d > best + 0.1) {
          b.nearest.set(c, -1); // moving away now: it has passed
          const now = performance.now();
          if (best < MISS_MIN || best > MISS_MAX || now - (lastQuip.get(c) ?? -1e9) < 2500) continue;
          lastQuip.set(c, now);
          playVoice(
            MISS_SOUNDS[Math.floor(Math.random() * MISS_SOUNDS.length)],
            CHARACTERS[c.kind].voice * (1 + Math.random() * 0.2),
          );
          bubbleOver(c, missFor(c.kind));
        }
      }
    }
  }

  /** A character got hit: a funny noise and a speech bubble with a quip over its head. */
  function hitReaction(c: CharacterEntity) {
    const now = performance.now();
    if (now - (lastQuip.get(c) ?? -1e9) < 2500) return;
    lastQuip.set(c, now);
    playVoice(
      HIT_VOICES[Math.floor(Math.random() * HIT_VOICES.length)],
      CHARACTERS[c.kind].voice * (0.9 + Math.random() * 0.3),
    );
    bubbleOver(c, quipFor(c.kind));
  }

  function say(c: CharacterEntity, line: Parameters<typeof playVoice>[0]) {
    const now = performance.now();
    if (now - c.lastVoice < CHAR_VOICE_GAP || now - lastAnyVoice < ANY_VOICE_GAP) return;
    c.lastVoice = lastAnyVoice = now;
    playVoice(line, CHARACTERS[c.kind].voice);
  }

  /** The fast ball heading for this character, if any. */
  function incomingBall(c: CharacterEntity): BallEntity | null {
    for (const b of balls) {
      const v = b.body.linvel();
      ballVel.set(v.x, v.y, v.z);
      if (ballVel.lengthSq() < 9) continue;
      toChar.copy(c.currPos).sub(b.currPos);
      if (toChar.length() < BALL_NOTICE_DISTANCE && toChar.dot(ballVel) > 0) return b;
    }
    return null;
  }

  function nearbyBlocksMoving(c: CharacterEntity): boolean {
    if (getPhysicsIdle()) return false;
    for (const e of blocks) {
      if (e.status === 'removed' || e.body.isSleeping()) continue;
      if (e.currPos.distanceTo(c.currPos) < SHAKE_DISTANCE && speedOf(e.body) > 0.6) return true;
    }
    return false;
  }

  function updateCharacters(dt: number) {
    const phase = getPhase();
    const result = phase === 'won' ? 'won' : phase === 'lost' ? 'lost' : null;
    for (const c of chars) {
      const w = c.body.angvel();
      const ball = incomingBall(c);
      let mood = moodFor({
        result,
        role: c.role,
        speed: speedOf(c.body),
        spin: Math.hypot(w.x, w.y, w.z),
        ballNear: ball !== null,
        shaking: nearbyBlocksMoving(c),
      });
      if (phase === 'title' && mood === 'idle') mood = 'dance'; // the dancers on the title letters
      if (mood !== c.mood) {
        c.mood = c.rig.mood = mood;
        if (mood !== 'idle' && mood !== 'wave' && mood !== 'dance') say(c, mood);
      }
      // watch an incoming ball; otherwise look at the player (the camera)
      lookTarget.copy(ball ? ball.mesh.position : camera.position);
      c.rig.root.updateMatrixWorld();
      c.rig.update(dt, c.rig.root.worldToLocal(lookTarget), musicBeat() ?? (performance.now() / 1000) * 2);
    }
  }

  return { spawnCharacter, getUpIfFallenOver, updateCharacters, updateNearMisses, hitReaction };
}
