import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { playCrowd } from './audio';
import { CHARACTERS, type CharacterKind, CharacterRig, crowdKinds, type Mood } from './characters';
import {
  type BallEntity,
  type CharacterEntity,
  capture,
  makeEntityBase,
  type Owner,
  type Phase,
  speedOf,
} from './entities';
import { musicBeat } from './music';
import type { Spot } from './props';
import { CATCH_FLOOR_Y, seeded } from './scene';
import { THEMES, type ThemeId } from './themes';

const CROWD_SCALE = { arena: 2.3, ground: 1.4 }; // ground spectators stand close to the camera, so a bit smaller
const CROWD_DENSITY = 0.25; // light, so a ball sends them flying
const CROWD_HOME_DELAY = 1.5; // s at rest away from home before poofing back
// mostly dancing to the music, with some standing and waving in between
const IDLE_ROUTINE: Mood[] = ['idle', 'idle', 'wave', 'dance', 'dance', 'dance'];

interface Spectator {
  entity: CharacterEntity;
  /** its own idle routine: stand, wave or dance, changing every few seconds */
  idleMood: Mood;
  nextChange: number;
  home: THREE.Vector3;
  homeRot: THREE.Quaternion;
  /** sim seconds spent off its perch and at rest; after a moment it poofs back */
  awayFor: number;
  lastBonk: number; // performance.now()
}

function randomDir(out: THREE.Vector3) {
  return out.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
}

/**
 * The spectators around the arena: a ball (or the laser) can knock them flying; they poof back to
 * their perch once they settle, and otherwise dance, wave or watch the action on the music's beat.
 */
export function createCrowd(deps: {
  scene: THREE.Scene;
  world: RAPIER.World;
  colliderOwner: Map<number, Owner>;
  particles: { burst: (at: THREE.Vector3, color: number, count: number, speed: number) => void };
  smoke: {
    emit: (
      at: THREE.Vector3,
      opts: { color: number; size: [number, number]; life: number; alpha: number },
    ) => void;
  };
  controls: OrbitControls;
  balls: BallEntity[];
  step: number;
  getPhase: () => Phase;
  getUpIfFallenOver: (c: CharacterEntity) => void;
  hitReaction: (c: CharacterEntity) => void;
  popupAt: (at: THREE.Vector3, text: string, negative: boolean, color?: string) => void;
}) {
  const {
    scene,
    world,
    colliderOwner,
    particles,
    smoke,
    controls,
    balls,
    step,
    getPhase,
    getUpIfFallenOver,
    hitReaction,
    popupAt,
  } = deps;

  const crowd: Spectator[] = [];
  let crowdCheerUntil = 0; // performance.now() until which the whole crowd cheers
  const puffPos = new THREE.Vector3();
  const puffVel = new THREE.Vector3();
  const crowdLook = new THREE.Vector3();

  function removeCrowd() {
    for (const s of crowd) {
      scene.remove(s.entity.rig.root);
      colliderOwner.delete(s.entity.collider.handle);
      world.removeRigidBody(s.entity.body);
    }
    crowd.length = 0;
  }

  /**
   * Fill the free spots: about half the world's own species, half anyone at all, scattered at random
   * (seeded per level). A few stand on the grass, the rest up on the arena.
   */
  function buildCrowd(
    themeId: ThemeId | null,
    crowdSpots: Spot[],
    levelCharacterKinds: CharacterKind[],
    count: number,
  ) {
    removeCrowd();
    if (!themeId) return;
    const rand = seeded((Math.random() * 2 ** 31) | 0); // a different crowd every time
    const palette = crowdKinds(themeId, THEMES[themeId].crowd, levelCharacterKinds);
    const natives = THEMES[themeId].crowd.filter((k) => palette.includes(k));
    const shuffle = <T>(list: T[]) =>
      list
        .map((item) => ({ item, k: rand() }))
        .sort((x, y) => x.k - y.k)
        .map((e) => e.item);
    const ground = shuffle(crowdSpots.filter((s) => s.ground));
    const stands = shuffle(crowdSpots.filter((s) => !s.ground));
    const picks = [...ground.slice(0, Math.ceil(count / 4)), ...stands].slice(0, count);
    for (const [n, spot] of picks.entries()) {
      const pool = rand() < 0.5 && natives.length > 0 ? natives : palette;
      const pick: CharacterKind = pool[Math.floor(rand() * pool.length)];
      // every third spectator on Tiki Isle is a totem, whenever the 5-kind cap leaves room for it
      const kind: CharacterKind =
        themeId === 'tiki' && n % 3 === 0 && palette.includes('totem') ? 'totem' : pick;
      const def = CHARACTERS[kind];
      const rig = new CharacterRig(kind, false, themeId); // no shadows: a crowd of shadow casters costs too much
      rig.danceStyle = Math.floor(rand() * 3);
      const scale = (spot.ground ? CROWD_SCALE.ground : CROWD_SCALE.arena) * (0.9 + rand() * 0.2);
      rig.root.scale.setScalar(scale);
      const home = spot.pos.clone();
      home.y += (def.size[1] / 2) * scale;
      const homeRot = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, spot.face);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(home.x, home.y, home.z)
          .setRotation(homeRot)
          .setAngularDamping(0.3),
      );
      const [w, h, d] = def.size;
      const collider = world.createCollider(
        RAPIER.ColliderDesc.cuboid((w / 2) * scale, (h / 2) * scale, (d / 2) * scale)
          .setDensity(def.density * CROWD_DENSITY)
          .setFriction(0.8)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
      );
      body.sleep();
      scene.add(rig.root);
      const entity: CharacterEntity = {
        ...makeEntityBase(body, collider),
        kind,
        role: 'decor',
        status: 'alive',
        rig,
        mood: 'idle',
        lastVoice: -1e9,
        tiltedFor: 0,
      };
      colliderOwner.set(collider.handle, entity);
      crowd.push({ entity, idleMood: 'idle', nextChange: 0, home, homeRot, awayFor: 0, lastBonk: -1e9 });
    }
    syncCrowd(1);
  }

  /** Put one spectator back on its perch, asleep. */
  function sendHome(s: Spectator) {
    const b = s.entity.body;
    b.setTranslation(s.home, false);
    b.setRotation(s.homeRot, false);
    b.setLinvel({ x: 0, y: 0, z: 0 }, false);
    b.setAngvel({ x: 0, y: 0, z: 0 }, false);
    b.sleep();
    s.entity.prevPos.copy(s.home);
    s.entity.currPos.copy(s.home);
    s.entity.prevRot.copy(s.homeRot);
    s.entity.currRot.copy(s.homeRot);
    s.awayFor = 0;
  }

  /** On every level load or retry: everyone back home and registered for collisions again. */
  function resetCrowd() {
    for (const s of crowd) {
      sendHome(s);
      colliderOwner.set(s.entity.collider.handle, s.entity);
    }
    syncCrowd(1);
  }

  /** A puff of smoke and sparkles where a spectator vanishes or reappears. */
  function poof(at: THREE.Vector3, size: number) {
    for (let i = 0; i < 4; i++) {
      puffPos.copy(at).addScaledVector(randomDir(puffVel), 0.4 * size);
      smoke.emit(puffPos, { color: 0xffffff, size: [0.6 * size, 1.6 * size], life: 0.5, alpha: 0.8 });
    }
    particles.burst(at, 0xffe066, 8, 3);
  }

  /** Physics step for the crowd; a spectator knocked off its perch poofs back once it comes to rest. */
  function stepCrowd() {
    for (const s of crowd) {
      const e = s.entity;
      const asleep = e.body.isSleeping();
      if (asleep && s.awayFor === 0 && e.currPos.distanceTo(s.home) < 0.5) continue; // at home, nothing to do
      if (!asleep) capture(e);
      const resting = asleep || speedOf(e.body) < 0.4;
      const away = e.currPos.distanceTo(s.home) > 0.5 || e.currPos.y < -5;
      s.awayFor = away && resting ? s.awayFor + step : 0;
      if (s.awayFor > CROWD_HOME_DELAY || e.currPos.y < CATCH_FLOOR_Y + 2) {
        poof(e.currPos, e.rig.root.scale.x);
        sendHome(s);
        poof(s.home, e.rig.root.scale.x);
      } else if (!away && resting && e.currPos.distanceTo(s.home) > 0.05) {
        getUpIfFallenOver(e); // nudged but still on its perch: stand back up
      }
    }
  }

  function syncCrowd(alpha: number) {
    for (const s of crowd) {
      const e = s.entity;
      e.rig.root.position.lerpVectors(e.prevPos, e.currPos, alpha);
      e.rig.root.quaternion.slerpQuaternions(e.prevRot, e.currRot, alpha);
    }
  }

  function isSpectator(e: CharacterEntity) {
    return crowd.some((s) => s.entity === e);
  }

  /** A ball (or the laser) bonked a spectator; one bonk per hit, not one per contact. */
  function bonk(e: CharacterEntity) {
    const s = crowd.find((c) => c.entity === e);
    const now = performance.now();
    if (!s || now - s.lastBonk < 1000) return;
    s.lastBonk = now;
    hitReaction(e);
    popupAt(e.currPos, 'Bonk!', false, '#ff8c42');
    playCrowd('cheer');
  }

  function crowdCheer(seconds: number) {
    crowdCheerUntil = Math.max(crowdCheerUntil, performance.now() + seconds * 1000);
    playCrowd('cheer');
  }

  function updateCrowd(dt: number) {
    const now = performance.now();
    const phase = getPhase();
    // everyone dances on the music's beat; without music they keep a steady 120 bpm together
    const beat = musicBeat() ?? (now / 1000) * 2;
    const flying = balls.find((b) => speedOf(b.body) > 3);
    crowd.forEach((s, i) => {
      const rig = s.entity.rig;
      let mood: Mood;
      if (!s.entity.body.isSleeping() && speedOf(s.entity.body) > 1.5) mood = 'tumble';
      else if (phase === 'won') mood = i % 3 === 0 ? 'cheer' : 'dance';
      else if (phase === 'lost') mood = 'sad';
      else if (phase === 'title' && now >= crowdCheerUntil)
        mood = 'dance'; // the title is a party
      else if (now < crowdCheerUntil) mood = i % 4 === 0 ? 'wave' : 'cheer';
      else {
        if (now > s.nextChange) {
          s.idleMood = IDLE_ROUTINE[Math.floor(Math.random() * IDLE_ROUTINE.length)];
          s.nextChange = now + 2500 + Math.random() * 4000;
        }
        mood = s.entity.kind === 'totem' ? 'dance' : s.idleMood; // totems never stop dancing
      }
      rig.mood = mood;
      // everyone watches the ball in flight, otherwise the action on the pedestal
      crowdLook.copy(flying ? flying.mesh.position : controls.target);
      rig.root.updateMatrixWorld();
      rig.update(dt, rig.root.worldToLocal(crowdLook), beat);
    });
  }

  return { crowd, buildCrowd, resetCrowd, stepCrowd, syncCrowd, updateCrowd, isSpectator, bonk, crowdCheer };
}
