import '@fontsource-variable/fredoka';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createAimInput, createAimVisuals, MIN_CHARGE_SECONDS, TAP_SPEED_THRESHOLD } from './aim-input';
import { playCrowd, playLaser, playScore, playStinger, setAmbience, unlockOnFirstGesture } from './audio';
import { createBalls } from './balls';
import { BLOCKS, type BlockType } from './blocks';
import { levelBrief } from './brief';
import { createCameraRig } from './camera-runtime';
import { createCharactersRuntime } from './characters-runtime';
import { createCrowd } from './crowd';
import { createDebugPanel } from './debug-panel';
import { isTv } from './device';
import {
  type BallEntity,
  type BlockEntity,
  type CharacterEntity,
  capture,
  makeEntityBase,
  type Owner,
  type Phase,
  speedOf,
} from './entities';
import { createFireworks } from './fireworks';
import { Debris, disposeMesh, makeZoneMesh, Particles, Puffs, Shake, Shockwaves, Sparks } from './fx';
import { createGemFx } from './gem-fx';
import { createGrab, WHITE } from './grab';
import { createHudPanels, QUALITIES, type Quality } from './hud-panels';
import { startTranslating } from './i18n';
import { type Level, loadBundledLevels } from './level';
import { createLevelRuntime } from './level-runtime';
import { blockTexture } from './marks';
import { blockMaterial, boxGeo, hiddenMatrix, titleOutlineMat } from './materials';
import { initMusic, setTrack } from './music';
import { type Party, partyModeFor } from './party';
import { createPhysicsStep } from './physics-step';
import { loadProgress, recordResult } from './progress';
import { type RemoteHost, startRemoteHost } from './remote';
import {
  aimToScreen,
  type HostMsg,
  MAX_REMOTE_SLOTS,
  REMOTE_SPEED_SCALE,
  type RemoteMsg,
} from './remote-protocol';
import { createRemoteSlotPanel } from './remote-ui';
import {
  characterScore,
  finalScore,
  friendLost,
  isSettled,
  medalFor,
  outcome,
  RIVAL_POINTS,
  zoneMultiplier,
} from './rules';
import { addLights, CATCH_FLOOR_Y, ISLAND_RADIUS, makeClouds, makeContactShadow, makeSky } from './scene';
import { THEMES } from './themes';
import { chargeTier } from './throw';
import { createToolFx } from './tool-fx';
import { TOOLS } from './tools';
import { createUi } from './ui';
import { createWorldTheme } from './world-theme';

const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const BALL_FLIGHT_SECONDS = 6; // a ball counts as "in motion" for this long after launch
const FALL_MARGIN = 0.3; // a block is fallen once its centre drops this far below the platform top
const SLOWMO_SCALE = 0.4;
const SKY_HEIGHT = 25; // m above the platform at which a floating cloud block counts as gone
const JINGLE_NOTES = [262, 294, 330, 392, 440, 523]; // C major pentatonic-ish, Hz
const PULL_DISTANCE = 2.6; // m a grabbed block must travel from its start to count as pulled out
const COLLAPSE_DISTANCE = 1.5; // m an untouched Jenga block may drift before the tower counts as fallen
const LASER_SPEED = 4; // m/s of impact a laser hit counts as for block behaviours (bombs, vanish, jingle)
const LASER_IMPULSE = 5; // N·s nudge applied to the block the beam hits
const BEAM_SECONDS = 0.18;
const HOSE_FORCE = 26; // N at the centre of the stream
const HOSE_RANGE = 22; // m
const HOSE_SPLASH = 1.1; // m around the hit point that is pushed too
const QUALITY_SETTINGS: Record<
  Quality,
  { pixelRatio: number; shadowMap: number; extras: boolean; crowd: number }
> = {
  // extras: rim light and gem sparkles
  low: { pixelRatio: 1, shadowMap: 512, extras: false, crowd: 6 },
  medium: { pixelRatio: 1.5, shadowMap: 1024, extras: true, crowd: 10 },
  high: { pixelRatio: 2, shadowMap: 2048, extras: true, crowd: 16 },
};
const SQUASH_SECONDS = 0.18;
const SLOWMO_PUSH = 0.18; // share of the camera distance the view pushes in during slow-mo
const WIN_ORBIT_SPEED = 0.15; // rad/s while the result screen is up

const params = {
  gravity: 9.81,
  massScale: 1, // multiplies every tool's mass
  radiusScale: 1,
  // ball speed (m/s) per power tier: tap, light, medium, full
  speedTap: 15,
  speedLight: 20,
  speedMedium: 25,
  speedFull: 32,
  // flick speed (px/s) at which tiers 1..3 start
  flickLight: 1200,
  flickMedium: 3000,
  flickFull: 7000,
  upwardBias: 0.06,
  solverIterations: 8,
  // grab spring: acceleration = stiffness * offset - damping * velocity, capped at maxAccel
  grabStiffness: 60,
  grabDamping: 12,
  grabMaxAccel: 50,
  restart: () => restart(),
};

await RAPIER.init();

// ---------- renderer / scene ----------
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.autoUpdate = false; // re-rendered only while something moves, see frame()
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; // keeps the saturated toy colours, unlike ACES/AgX

const scene = new THREE.Scene();
const fog = new THREE.Fog(THEMES.meadow.sky.horizon, 70, 190);
const background = new THREE.Color(THEMES.meadow.sky.horizon); // shows only if the sky dome is ever clipped
scene.fog = fog;
scene.background = background;
const sky = makeSky();
const clouds = makeClouds();
scene.add(sky, clouds);
scene.environmentIntensity = 0.6;

const orbitBtn = document.getElementById('orbit-btn') as HTMLButtonElement;
const cam = createCameraRig(canvas, orbitBtn);
const {
  camera,
  controls,
  orbitCamera,
  frameCamera: frameCameraRaw,
  skipIntro,
  updateIntro,
  isOrbitMode,
} = cam;

const { sun, rim, hemi } = addLights(scene); // sun is the one shadow light

let quality: Quality = readQuality();

function readQuality(): Quality {
  try {
    const saved = localStorage.getItem('blox.quality.v1');
    if (saved && (QUALITIES as readonly string[]).includes(saved)) return saved as Quality;
  } catch {
    // storage blocked: fall through to the default
  }
  if (isTv) return 'low'; // TV GPUs are weak and the box can't easily be swapped out
  return matchMedia('(pointer: coarse)').matches ? 'medium' : 'high'; // phones start lighter
}

function applyQuality() {
  const q = QUALITY_SETTINGS[quality];
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
  sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
  sun.shadow.map?.dispose();
  sun.shadow.map = null; // reallocated at the new size on the next shadow render
  rim.visible = q.extras;
  if (worldTheme.getThemeId()) buildCrowd(); // crowd size follows quality
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.needsUpdate = true;
}

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  renderer.shadowMap.needsUpdate = true;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- physics ----------
const world = new RAPIER.World({ x: 0, y: -params.gravity, z: 0 });
world.timestep = STEP;
world.integrationParameters.numSolverIterations = params.solverIterations;
const events = new RAPIER.EventQueue(true);

// the island top; anything knocked past its edge drops to a catch floor out of sight, where it can sleep
world.createCollider(
  RAPIER.ColliderDesc.cylinder(0.5, ISLAND_RADIUS).setTranslation(0, -0.5, 0).setFriction(0.9),
);
world.createCollider(
  RAPIER.ColliderDesc.cuboid(200, 0.5, 200)
    .setTranslation(0, CATCH_FLOOR_Y - 0.5, 0)
    .setFriction(0.9),
);

const blocks: BlockEntity[] = [];
const balls: BallEntity[] = [];
const colliderOwner = new Map<number, Owner>();
const chars: CharacterEntity[] = [];
const blockMeshes: THREE.InstancedMesh[] = [];
let platformCollider: RAPIER.Collider | null = null;
let platformMesh: THREE.Mesh | null = null;
let platformShadow: THREE.Mesh | null = null;
const zoneMeshes: THREE.Mesh[] = [];
const particles = new Particles(scene);
const sparks = new Sparks(scene);
const shake = new Shake();
const smoke = new Puffs(scene, 160, THREE.NormalBlending);
const glow = new Puffs(scene, 120, THREE.AdditiveBlending);
const shockwaves = new Shockwaves(scene);
const debris = new Debris(scene);
const fireworks = createFireworks({ camera, sparks, glow });
const { beam, jet, beamMat, beamEnd, beamDir, castBeam, showBeam, showJet } = createToolFx({
  scene,
  camera,
  world,
  sparks,
});
const {
  crowd,
  buildCrowd: buildCrowdRaw,
  resetCrowd,
  stepCrowd,
  syncCrowd,
  updateCrowd,
  isSpectator,
  bonk,
  crowdCheer,
} = createCrowd({
  scene,
  world,
  colliderOwner,
  particles,
  smoke,
  controls,
  balls,
  step: STEP,
  getPhase: () => phase,
  getUpIfFallenOver: (c) => characters.getUpIfFallenOver(c),
  hitReaction: (c) => characters.hitReaction(c),
  popupAt,
});
/** `buildCrowd` keeps the old no-arg call shape (reads the current theme/spots/level/quality). */
function buildCrowd() {
  buildCrowdRaw(
    worldTheme.getThemeId(),
    worldTheme.getCrowdSpots(),
    level.characters.map((c) => c.kind),
    QUALITY_SETTINGS[quality].crowd,
  );
}

const platformMat = new THREE.MeshStandardMaterial({
  color: 0xc8a27a,
  roughness: 0.8,
  map: blockTexture('wood', false),
});

// ---------- worlds ----------
const worldTheme = createWorldTheme({
  scene,
  sky,
  background,
  fog,
  sun,
  rim,
  hemi,
  clouds,
  platformMat,
  renderer,
  world,
  buildCrowd,
  getLevel: () => level,
  setTrack,
  setAmbience,
  blockTexture,
});
applyQuality(); // deferred until here: reads worldTheme, built just above

// ---------- game state ----------
const levels = loadBundledLevels();
let levelIndex = 0;
let level: Level = levels[0];
let phase: Phase = 'menu';
let throwsUsed = 0;
let simTime = 0;
let lastMotion = 0;
let collapsed = false; // a Jenga tower block (never grabbed) was knocked out of place
let party: Party | null = null; // hot-seat game in progress, null for solo play
let turnActive = false; // party: the current player has acted and the scene is still resolving
let spraying = false; // hose held down
let beamLeft = 0; // s the laser beam stays visible
let physicsIdle = true; // everything asleep: world.step is skipped
let bonus = 0; // chain-reaction points this attempt

const { spawnBall, removeBallBody } = createBalls({
  world,
  scene,
  balls,
  colliderOwner,
  getLevel: () => level,
  getMassScale: () => params.massScale,
  getRadiusScale: () => params.radiusScale,
});

const ui = createUi({
  onSelect: (i, players) => {
    if (players > 1) startParty(i, players);
    else startSolo(i);
    forgetMenuReturn();
    ui.hideMenu();
  },
  onRetry: () => restart(),
  onNext: () => startSolo(Math.min(levelIndex + 1, levels.length - 1)),
  onOpenMenu: () => openMenu(),
  onCloseMenu: () => closeMenu(),
  onTitle: () => showTitle(),
});

/** Bodies that should start asleep: put to sleep once the new colliders are in the scene queries. */
const pendingSleep: RAPIER.RigidBody[] = [];
const characters = createCharactersRuntime({
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
  getLevelTheme: () => level.theme,
  step: STEP,
  getPhase: () => phase,
  getPhysicsIdle: () => physicsIdle,
});

const physics = createPhysicsStep({
  world,
  events,
  colliderOwner,
  blocks,
  balls,
  chars,
  jingleNotes: JINGLE_NOTES,
  getSimTime: () => simTime,
  getFrameNow: () => lastFrameAt,
  getExtras: () => QUALITY_SETTINGS[quality].extras,
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
  hitReaction: characters.hitReaction,
  removeBlock,
  removeBallBody,
  addBonus: (gained: number) => {
    bonus += gained;
  },
});

const TITLE_INDEX = -2; // levelIndex while the title scene is up (not -1, so it gets a fly-in)

const levelRuntime = createLevelRuntime({
  ui,
  levels,
  cam,
  loadLevel,
  fireworks,
  TITLE_INDEX,
  blocks,
  chars,
  getLevel: () => level,
  getLevelIndex: () => levelIndex,
  getPhase: () => phase,
  setPhase: (p) => {
    phase = p;
  },
  getParty: () => party,
  setParty: (p) => {
    party = p;
  },
  getThrowsUsed: () => throwsUsed,
  getBonus: () => bonus,
  setTurnActive: (active) => {
    turnActive = active;
  },
});
const {
  titleScene,
  openMenu,
  closeMenu,
  forgetMenuReturn,
  showTitle,
  blockStates,
  charStates,
  throwsLeft,
  refreshStats,
  resetStats,
  startSolo,
  startParty,
  restart,
  refreshParty,
  endPartyTurn,
  partyTopple,
} = levelRuntime;

function clearLevel() {
  for (const b of blocks) if (b.status !== 'removed') world.removeRigidBody(b.body); // removed ones are already gone
  blocks.length = 0;
  for (const m of blockMeshes) {
    scene.remove(m);
    m.dispose();
  }
  blockMeshes.length = 0;
  forgetHighlight();
  gemFx.resetShiny();
  for (const b of balls) removeBallBody(b);
  balls.length = 0;
  for (const c of chars) {
    world.removeRigidBody(c.body);
    scene.remove(c.rig.root);
  }
  chars.length = 0;
  colliderOwner.clear();
  physics.clearPending();
  if (platformCollider) world.removeCollider(platformCollider, false);
  if (platformMesh) {
    scene.remove(platformMesh);
    platformMesh.geometry.dispose();
  }
  if (platformShadow) {
    scene.remove(platformShadow);
    disposeMesh(platformShadow);
  }
  for (const z of zoneMeshes) {
    scene.remove(z);
    disposeMesh(z);
  }
}

function loadLevel(index: number) {
  clearLevel();
  levelIndex = index;
  level = index === TITLE_INDEX ? titleScene : levels[index];
  // a subtle per-level key/tempo flavour, so levels in the same world don't all sound identical
  worldTheme.applyTheme(level.theme, index >= 0 ? index % 3 : 0);
  worldTheme.applyStageLight(index === TITLE_INDEX);
  worldTheme.applyProps(level.theme, Math.max(...level.platform.size) / 2, level.id);
  resetCrowd(); // back on their perches, and known to the collision lookup again (clearLevel emptied it)
  fireworks.resetFireworks();
  throwsUsed = 0;
  forgetLastThrow();
  simTime = 0;
  lastMotion = 0;
  resetStats();
  collapsed = false;
  grab.entity = null;
  turnActive = false;
  spraying = false;
  bonus = 0;
  physics.resetChain();
  beamLeft = 0;
  beam.visible = false;
  phase = 'playing';

  const [sx, sz] = level.platform.size;
  const top = level.platform.top;
  platformCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(sx / 2, top / 2, sz / 2)
      .setTranslation(0, top / 2, 0)
      .setFriction(0.9),
  );
  platformMesh = new THREE.Mesh(new RoundedBoxGeometry(sx, top, sz, 3, 0.12), platformMat);
  platformMesh.position.set(0, top / 2, 0);
  platformMesh.receiveShadow = true;
  platformMesh.castShadow = true;
  platformShadow = makeContactShadow(sx, sz);
  scene.add(platformMesh, platformShadow);
  zoneMeshes.length = 0;
  if (level === titleScene) {
    // black outline along the foot of the letters: a thin slab under each block that rests on the platform
    const feet = level.blocks.filter((b) => b.pos[1] - b.size[1] / 2 < 0.05);
    const outline = 0.09;
    const slab = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.02, 1),
      new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }),
      feet.length,
    );
    feet.forEach((b, i) => {
      tmpMat.compose(
        tmpPos.set(b.pos[0], top + 0.011, b.pos[2]),
        tmpRot.identity(),
        tmpScale.set(b.size[0] + outline * 2, 1, b.size[2] + outline * 2),
      );
      slab.setMatrixAt(i, tmpMat);
    });
    slab.frustumCulled = false;
    scene.add(slab);
    zoneMeshes.push(slab);
  }
  for (const zone of level.zones) {
    const mesh = makeZoneMesh(zone);
    scene.add(mesh);
    zoneMeshes.push(mesh);
  }

  // one InstancedMesh per block type used by this level
  const counts = new Map<BlockType, number>();
  for (const b of level.blocks) counts.set(b.type, (counts.get(b.type) ?? 0) + 1);
  const meshByType = new Map<BlockType, THREE.InstancedMesh>();
  const nextInstance = new Map<BlockType, number>();
  for (const [type, count] of counts) {
    let material = blockMaterial(type);
    if (level === titleScene && material instanceof THREE.MeshStandardMaterial) {
      // a faint glow keeps the sign's colours up without flattening its shading and markings
      material = material.clone();
      const hsl = { h: 0, s: 0, l: 0 };
      material.color.getHSL(hsl);
      material.color.setHSL(hsl.h, 1, 0.5); // fully saturated, mid brightness
      material.emissive.copy(material.color);
      material.emissiveIntensity = 0.15;
    }
    if (gemFx.SHINY[type] && material instanceof THREE.MeshStandardMaterial)
      gemFx.registerShiny(material, type);
    const mesh = new THREE.InstancedMesh(boxGeo, material, count);
    for (let i = 0; i < count; i++) mesh.setColorAt(i, WHITE); // per-block tint, used to mark the grabbed block
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    blockMeshes.push(mesh);
    if (level === titleScene) {
      // blocks touch, so only the outline of the whole letter shows
      const outline = new THREE.InstancedMesh(boxGeo, titleOutlineMat, count);
      outline.instanceMatrix = mesh.instanceMatrix; // moves with the blocks
      outline.frustumCulled = false;
      scene.add(outline);
      blockMeshes.push(outline);
    }
    meshByType.set(type, mesh);
    nextInstance.set(type, 0);
  }

  for (const spec of level.blocks) {
    const def = BLOCKS[spec.type];
    const [x, y, z] = spec.pos;
    const desc = def.mobile
      ? RAPIER.RigidBodyDesc.dynamic()
          .setLinearDamping(def.behaviour === 'float' ? 0.8 : 0.05) // floaters drift, not rocket
          .setAngularDamping(0.1)
      : RAPIER.RigidBodyDesc.fixed();
    desc
      .setTranslation(x, y + top, z)
      .setRotation({ x: 0, y: Math.sin(spec.rot / 2), z: 0, w: Math.cos(spec.rot / 2) });
    const body = world.createRigidBody(desc);
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(spec.size[0] / 2, spec.size[1] / 2, spec.size[2] / 2)
        .setDensity(def.density)
        .setFriction(def.friction)
        .setRestitution(def.restitution)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    if (def.mobile) pendingSleep.push(body); // blocks spawn asleep (see the end of loadLevel)
    const mesh = meshByType.get(spec.type) as THREE.InstancedMesh;
    const instance = nextInstance.get(spec.type) ?? 0;
    nextInstance.set(spec.type, instance + 1);
    const entity: BlockEntity = {
      ...makeEntityBase(body, collider),
      type: spec.type,
      status: 'alive',
      mesh,
      instance,
      size: new THREE.Vector3(...spec.size),
      exploding: false,
      hitsLeft: def.hits ?? 1,
      lastHit: -1,
      note: ((Math.round(x * 2) % JINGLE_NOTES.length) + JINGLE_NOTES.length) % JINGLE_NOTES.length,
      multiplier: 1,
      startPos: new THREE.Vector3(x, y + top, z),
      grabbedOnce: false,
      squash: 0,
    };
    blocks.push(entity);
    colliderOwner.set(collider.handle, entity);
  }

  for (const spec of level.characters) characters.spawnCharacter(spec, top);
  // everything starts asleep, so the physics loop skips world.step; one tiny step puts the new colliders
  // into the scene queries (or the laser, hose and grab rays find nothing), and only then do the bodies
  // go to sleep: a step taken while they were already asleep woke the whole scene
  const stepDt = world.timestep;
  world.timestep = 1e-4;
  world.step();
  world.timestep = stepDt;
  for (const body of pendingSleep) body.sleep();
  pendingSleep.length = 0;

  frameCamera(true);
  startIntro();
  syncRender(1);
  refreshStats();
  ui.setLevel(level);
  if (index !== TITLE_INDEX) ui.hideTitle();
  refreshParty();
  renderer.shadowMap.needsUpdate = true;
}

/** `vary`: a level start picks a random height and distance; resetting the view (Enter) does not. */
function frameCamera(vary = false) {
  frameCameraRaw(level, level === titleScene, vary);
}

/** Starts the fly-in for a level that is new (not a retry or a Jenga-off rebuild); shows its banner. */
function startIntro() {
  if (!cam.startIntro(levelIndex)) return;
  if (levelIndex !== TITLE_INDEX) ui.showBanner(levelBrief(level, levelIndex + 1));
}

// ---------- camera moves: result orbit, slow-mo push-in ----------
let push = 0;
const pushOffset = new THREE.Vector3();

// ---------- behaviours: explode / vanish ----------
function removeBlock(e: BlockEntity) {
  if (e.status === 'removed') return;
  e.status = 'removed';
  colliderOwner.delete(e.collider.handle);
  world.removeRigidBody(e.body);
  e.mesh.setMatrixAt(e.instance, hiddenMatrix);
  e.mesh.instanceMatrix.needsUpdate = true;
}

// ---------- laser and hose ----------
const sprayHit = new THREE.Vector3();

/** Instant hit: a small nudge plus the block's hit behaviour (pops bombs, vanish and jingle blocks). */
function fireLaser(px: number, py: number) {
  const hit = castBeam(px, py, 80);
  playLaser();
  beamLeft = BEAM_SECONDS;
  showBeam(TOOLS.laser.color, 1);
  if (!hit) return;
  particles.burst(beamEnd, TOOLS.laser.color, 8, 3);
  const owner = colliderOwner.get(hit.collider.handle);
  if (owner && 'rig' in owner && isSpectator(owner)) {
    owner.body.applyImpulseAtPoint(beamDir.clone().multiplyScalar(LASER_IMPULSE * 2), beamEnd, true);
    bonk(owner);
    return;
  }
  if (!owner || !('type' in owner) || !BLOCKS[owner.type].mobile) return;
  owner.body.applyImpulseAtPoint(beamDir.clone().multiplyScalar(LASER_IMPULSE), beamEnd, true);
  const toVanish = new Set<BlockEntity>();
  physics.triggerBlock(owner, LASER_SPEED, owner, undefined, toVanish);
  physics.vanishAll(toVanish);
}

/** One physics step of water: push the block under the nozzle and its neighbours along the stream. */
function applyHose() {
  if (!spraying) return;
  if (throwsLeft() <= 0 || phase !== 'playing') {
    spraying = false;
    beam.visible = false;
    return;
  }
  throwsUsed += STEP;
  lastMotion = simTime;
  const hit = castBeam(aim.x, aim.y, HOSE_RANGE);
  showJet(hit !== null);
  if (!hit) return;
  sprayHit.copy(beamEnd);
  if (Math.random() < 0.5) particles.burst(sprayHit, TOOLS.hose.color, 1, 2);
  const direct = colliderOwner.get(hit.collider.handle);
  const reach = HOSE_SPLASH + 0.6;
  for (const e of [...blocks, ...chars]) {
    if ('type' in e && (e.status === 'removed' || !BLOCKS[e.type].mobile)) continue;
    const d = e.currPos.distanceTo(sprayHit);
    if (d > reach && e !== direct) continue;
    const falloff = 1 - 0.6 * Math.min(d / reach, 1);
    const impulse = beamDir.clone().multiplyScalar(HOSE_FORCE * falloff * STEP);
    if (e === direct) e.body.applyImpulseAtPoint(impulse, sprayHit, true);
    else e.body.applyImpulse(impulse, true);
  }
}

/** True when nothing can move on its own, so the physics step can be skipped. */
function worldAsleep() {
  if (physics.hasPending() || grab.entity || spraying) return false;
  for (const b of balls) if (!b.body.isSleeping()) return false;
  for (const c of chars) if (!c.body.isSleeping()) return false;
  for (const s of crowd) if (!s.entity.body.isSleeping()) return false;
  for (const e of blocks) {
    if (e.status !== 'removed' && BLOCKS[e.type].mobile && !e.body.isSleeping()) return false;
  }
  return true;
}

// ---------- fixed step + interpolation ----------
const tmpPos = new THREE.Vector3();
const tmpRot = new THREE.Quaternion();
const tmpMat = new THREE.Matrix4();
const tmpScale = new THREE.Vector3();

function syncRender(alpha: number) {
  for (const e of blocks) {
    if (e.status === 'removed') continue;
    tmpPos.lerpVectors(e.prevPos, e.currPos, alpha);
    tmpRot.slerpQuaternions(e.prevRot, e.currRot, alpha);
    if (e.squash > 0) {
      const k = Math.sin(e.squash * Math.PI) * e.squash; // in-out squash, strongest just after the hit
      tmpScale.set(e.size.x * (1 + 0.14 * k), e.size.y * (1 - 0.18 * k), e.size.z * (1 + 0.14 * k));
      tmpMat.compose(tmpPos, tmpRot, tmpScale);
    } else {
      tmpMat.compose(tmpPos, tmpRot, e.size);
    }
    e.mesh.setMatrixAt(e.instance, tmpMat);
  }
  for (const m of blockMeshes) m.instanceMatrix.needsUpdate = true;
  syncCrowd(alpha);
  for (const c of chars) {
    c.rig.root.position.lerpVectors(c.prevPos, c.currPos, alpha);
    c.rig.root.quaternion.slerpQuaternions(c.prevRot, c.currRot, alpha);
  }
  for (const e of balls) {
    e.mesh.position.lerpVectors(e.prevPos, e.currPos, alpha);
    e.mesh.quaternion.slerpQuaternions(e.prevRot, e.currRot, alpha);
  }
}

const popupPos = new THREE.Vector3();

/** Floating "+100" / "-100" where a scoring block fell, so the player sees what counted. */
/** Floating text above a world position (skipped when it is behind the camera). */
function popupAt(at: THREE.Vector3, text: string, negative: boolean, color?: string) {
  popupPos.copy(at);
  popupPos.y = Math.max(popupPos.y, level.platform.top) + 0.8; // above it, not under the ground
  popupPos.project(camera);
  if (popupPos.z > 1) return;
  ui.popup(text, ((popupPos.x + 1) / 2) * innerWidth, ((1 - popupPos.y) / 2) * innerHeight, negative, color);
}

function popupFor(e: BlockEntity) {
  const points = BLOCKS[e.type].points;
  if (points === 0) return;
  particles.burst(e.currPos, BLOCKS[e.type].color, 10, 4);
  playScore(e.type === 'gem' ? 'gem' : points < 0 ? 'penalty' : 'point');
  if (points > 0) crowdCheer(1.2);
  popupAt(
    e.currPos,
    `${points > 0 ? '+' : ''}${points}`,
    points < 0,
    `#${BLOCKS[e.type].color.toString(16).padStart(6, '0')}`,
  );
}

/** A character went over the edge: points for a rival, a warning for a friend. */
function characterFell(c: CharacterEntity) {
  if (c.role === 'rival') {
    playScore('rival');
    crowdCheer(1.5);
    popupAt(c.currPos, `+${RIVAL_POINTS}`, false, '#e63946');
  } else if (c.role === 'friend') {
    popupAt(c.currPos, 'Oh no!', true);
    playCrowd('aww');
  }
}

function stepPhysics() {
  applyGrabForce();
  applyHose();
  physicsIdle = worldAsleep();
  if (!physicsIdle) world.step(events);
  simTime += STEP;
  physics.handleImpacts();

  physics.processPending(simTime);

  const fallY = level.platform.top - FALL_MARGIN;
  let moving = physics.hasPendingBlasts() || grab.entity !== null || spraying; // holding or soaking is never "settled"
  let allAsleep = true;
  const jenga = level.goal.type === 'jenga';
  for (const e of blocks) {
    if (e.status === 'removed' || !BLOCKS[e.type].mobile) continue;
    capture(e);
    if (jenga) {
      const moved = e.currPos.distanceTo(e.startPos);
      if (e.grabbedOnce) {
        if (e.status !== 'pulled' && grab.entity !== e && moved > PULL_DISTANCE) e.status = 'pulled';
      } else if (moved > COLLAPSE_DISTANCE) {
        collapsed = true;
      }
    }
    if (e.currPos.y > level.platform.top + SKY_HEIGHT) {
      removeBlock(e); // a cloud drifted out of the level
      continue;
    }
    if (e.status === 'alive' && e.currPos.y < fallY) {
      e.status = 'fallen';
      popupFor(e);
    }
    // zones count where the block comes to rest on the floor, so keep updating while it slides
    if (e.status === 'fallen' && level.zones.length > 0 && e.currPos.y < 1) {
      e.multiplier = zoneMultiplier(level.zones, e.currPos.x, e.currPos.z);
    }
    if (!e.body.isSleeping()) {
      allAsleep = false;
      if (speedOf(e.body) > 0.1) moving = true;
    }
  }
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    capture(b);
    b.age += STEP;
    if (b.currPos.y < -20) {
      removeBallBody(b);
      balls.splice(i, 1);
      continue;
    }
    if (b.age < BALL_FLIGHT_SECONDS && !b.body.isSleeping() && speedOf(b.body) > 1) {
      moving = true;
      allAsleep = false;
    }
  }
  for (const c of chars) {
    capture(c);
    characters.getUpIfFallenOver(c);
    if (c.status === 'alive' && c.currPos.y < fallY) {
      c.status = 'fallen';
      characterFell(c);
    }
    if (!c.body.isSleeping()) {
      allAsleep = false;
      if (speedOf(c.body) > 0.1) moving = true;
    }
  }
  stepCrowd(); // the crowd never holds up settling or scoring
  if (moving) lastMotion = simTime;

  refreshStats();
  if (phase !== 'playing') return;
  // a fallen tower is final, so it ends the level without waiting for the scene to settle
  const settled = throwsUsed > 0 && isSettled(simTime - lastMotion, allAsleep && !moving);
  if (party) {
    if (jenga && collapsed) partyTopple();
    else if (turnActive && settled) endPartyTurn();
  } else if (settled || (jenga && collapsed)) {
    finishIfDone();
  }
}

function finishIfDone() {
  const states = blockStates();
  const friendDown = friendLost(charStates());
  const result = outcome(level.goal, states, throwsLeft(), collapsed, friendDown);
  if (result === 'playing') return;
  phase = result;
  if (result === 'won') {
    const score = finalScore(states, throwsLeft(), bonus + characterScore(charStates()));
    const medal = medalFor(score, level.medals);
    const saved = recordResult(level.id, score, medal);
    playStinger(medal === 'gold' ? 'gold' : 'win');
    playCrowd('cheer');
    fireworks.celebrate(medal === 'gold' ? 40 : 26, level.platform.top);
    const hasNext = levelIndex < levels.length - 1;
    ui.showResult({
      won: true,
      score,
      medal,
      best: saved.best,
      hasNext,
      autoNextSeconds: hasNext ? 7 : undefined,
    });
  } else {
    playStinger('lose');
    playCrowd('aww');
    ui.showResult({
      won: false,
      score: 0,
      medal: null,
      best: 0,
      hasNext: false,
      lostReason: friendDown ? 'A friend fell off!' : collapsed ? 'The tower fell!' : undefined,
    });
  }
}

function canThrow() {
  // party: one action per turn; the title scene takes free throws
  return (phase === 'playing' || phase === 'title') && throwsLeft() > 0 && !turnActive && throwCooldownDone();
}

function isGrabTool() {
  return TOOLS[level.tool].grab === true;
}

function isLaserTool() {
  return TOOLS[level.tool].laser === true;
}

function isHoseTool() {
  return TOOLS[level.tool].hose === true;
}

/** Laser and hose aim along the camera ray instead of lobbing a ball. */
function isBeamTool() {
  return isLaserTool() || isHoseTool();
}

// last known pointer position, for the aim preview (mouse hover or active throw)
const aim = { x: innerWidth / 2, y: innerHeight / 2, visible: false };

// ---------- phone remote: tilt aims, a swipe on the phone throws; one phone per hot-seat player ----------
const remoteBtn = document.getElementById('remote-btn') as HTMLElement;
const remotePanel = document.getElementById('remote-panel') as HTMLElement;
const remoteSlotsEl = document.getElementById('remote-slots') as HTMLElement;
let remoteHost: RemoteHost | null = null;
let lastRemoteCheck = 0;
const remoteConnected: boolean[] = Array(MAX_REMOTE_SLOTS).fill(false);

/** How many phones can usefully connect right now: one per hot-seat player, or just one for solo play. */
function activeSlotCount() {
  return party ? party.players : 1;
}

/** Which slot's input currently controls the game: the player at the table, or slot 0 solo. */
function activeRemoteSlot() {
  return party ? party.current : 0;
}

const remoteSlotPanel = createRemoteSlotPanel({
  remoteSlotsEl,
  activeSlotCount,
  getHost: () => remoteHost,
  remoteConnected,
});

/** Buttons on the phone: the same actions as the on-screen ones. Any connected phone may use these. */
function remoteCommand(m: RemoteMsg & { t: 'cmd' | 'select' }) {
  if (m.t === 'select') {
    if (m.index >= levels.length) return;
    forgetMenuReturn();
    // several phones connected and the level allows it: picking one from a phone starts a party
    const players = remoteConnected.filter(Boolean).length;
    if (players > 1 && partyModeFor(levels[m.index])) startParty(m.index, players);
    else startSolo(m.index);
    ui.hideMenu();
    return;
  }
  if (m.cmd === 'retry') restart();
  else if (m.cmd === 'next') startSolo(Math.min(levelIndex + 1, levels.length - 1));
  else if (m.cmd === 'menu') openMenu();
  else showTitle();
}

let remoteSent = '';
let remoteLevelsSent = '';

/** Keep every connected phone's buttons in step with the game (checked a few times a second). */
function updateRemoteState() {
  if (!remoteHost) return;
  if (!remotePanel.hidden) remoteSlotPanel.refresh();
  if (!remoteConnected.some(Boolean)) return;
  const current = levelIndex >= 0 ? level : null;
  const state: HostMsg = {
    t: 'state',
    phase:
      phase === 'menu' || phase === 'title' || phase === 'playing' || phase === 'won' || phase === 'lost'
        ? phase
        : 'playing',
    level: current ? levelIndex : -1,
    name: current?.name ?? '',
    throwsLeft: current ? throwsLeft() : 0,
    hasNext: !!current && !party && levelIndex < levels.length - 1,
    // the phone shows the power as words, so it needs to know where each power level starts (in its own px/s)
    tiers: [
      Math.round(params.flickLight / REMOTE_SPEED_SCALE),
      Math.round(params.flickMedium / REMOTE_SPEED_SCALE),
      Math.round(params.flickFull / REMOTE_SPEED_SCALE),
    ],
    players: activeSlotCount(),
    currentPlayer: activeRemoteSlot(),
  };
  const key = JSON.stringify(state);
  if (key !== remoteSent) {
    remoteSent = key;
    remoteHost.broadcast(state);
  }
  // the level list carries the medals, so it is resent when progress changes
  const progress = loadProgress();
  const list: HostMsg = {
    t: 'levels',
    levels: levels.map((l) => ({ name: l.name, theme: l.theme, medal: progress[l.id]?.medal ?? null })),
  };
  const listKey = JSON.stringify(list);
  if (listKey !== remoteLevelsSent) {
    remoteLevelsSent = listKey;
    remoteHost.broadcast(list);
  }
}

// performance.now() when a phone holding its throw button went down, or null (read by aim-input.ts)
let remoteHoldStart: number | null = null;

function handleRemote(slot: number, m: Exclude<RemoteMsg, { t: 'identify' }>) {
  if (m.t === 'cmd' || m.t === 'select') {
    remoteCommand(m);
    return;
  }
  if (slot !== activeRemoteSlot()) return; // not this phone's turn: its input does nothing
  if (cam.introT < 1) {
    if (m.t === 'down') skipIntro();
    return;
  }
  if (m.t === 'aim') {
    const at = aimToScreen(m.yaw, m.pitch, innerWidth, innerHeight);
    aim.x = at.x;
    aim.y = at.y;
    aim.visible = true;
    return;
  }
  if (m.t === 'down') {
    if (!canThrow()) return;
    if (isGrabTool()) beginGrab(aim.x, aim.y);
    else if (isHoseTool()) {
      spraying = true;
      ui.hideBanner();
    } else {
      remoteHoldStart = performance.now();
    }
    return;
  }
  // the finger came up: stop spraying, let go, or throw with the swipe's speed (or, for a held
  // press with little swipe, the hold time charges power the way holding Space does)
  if (spraying) {
    spraying = false;
    beam.visible = false;
  } else if (grab.entity) {
    grab.entity = null;
  } else if (!isGrabTool() && !isHoseTool()) {
    remoteHoldStart = null;
    if (m.speed < TAP_SPEED_THRESHOLD && m.holdMs / 1000 >= MIN_CHARGE_SECONDS) {
      launch(aim.x, aim.y, flickForTier(chargeTier(m.holdMs / 1000)));
    } else {
      launch(aim.x, aim.y, m.speed * REMOTE_SPEED_SCALE);
    }
  }
}

function closeRemotePanel() {
  remotePanel.hidden = true;
  remoteBtn.setAttribute('aria-expanded', 'false');
}

/** Show the QR panel and open the connection the first time it's needed. */
function openRemotePanel() {
  remotePanel.hidden = false;
  remoteBtn.setAttribute('aria-expanded', 'true');
  if (!remoteHost) {
    remoteHost = startRemoteHost(handleRemote, (slot, status) => {
      remoteConnected[slot] = status === 'connected';
      remoteSent = remoteLevelsSent = ''; // a reconnecting phone needs everything again
      remoteSlotPanel.updateStatus();
      // every phone this round needs is in: the QR panel has done its job, so get it out of the way
      if (!remotePanel.hidden && remoteConnected.slice(0, activeSlotCount()).every(Boolean)) {
        closeRemotePanel();
      }
    });
  }
  remoteSlotPanel.forceRebuild(); // fresh QR codes and status, in case this isn't the first time
  remoteSlotPanel.refresh();
}

remoteBtn.addEventListener('click', (ev) => {
  ev.stopPropagation();
  if (!remotePanel.hidden) {
    closeRemotePanel();
    return;
  }
  openRemotePanel();
});
remotePanel.addEventListener('click', (ev) => ev.stopPropagation());
// no keyboard/mouse on a TV: the QR goes up by itself, instead of waiting for a tap on remoteBtn
if (isTv) openRemotePanel();

createHudPanels({
  getQuality: () => quality,
  setQuality: (q) => {
    quality = q;
  },
  applyQuality,
});

// ---------- aim visuals, the grab tool, and the throw input (see aim-input.ts and grab.ts) ----------
const aimVisuals = createAimVisuals(scene);
const { grab, beginGrab, applyGrabForce, forgetHighlight, updateGrabHighlight, updateGrabPreview } =
  createGrab({
    camera,
    world,
    colliderOwner,
    params,
    aim,
    step: STEP,
    ring: aimVisuals.ring,
    arc: aimVisuals.arc,
    tierColors: aimVisuals.tierColors,
    canThrow,
    ui,
    onPickUp: () => {
      throwsUsed++; // each pick-up uses one grab
      if (party) turnActive = true;
      lastMotion = simTime;
      refreshStats();
    },
  });

const { launch, flickForTier, applyKeys, updateAimPreview, throwCooldownDone, forgetLastThrow } =
  createAimInput({
    canvas,
    camera,
    world,
    params,
    aim,
    grab,
    beginGrab,
    updateGrabPreview,
    visuals: aimVisuals,
    beam,
    beamEnd,
    castBeam,
    hoseRange: HOSE_RANGE,
    cam,
    skipIntro,
    isOrbitMode,
    orbitCamera,
    controls,
    ui,
    canThrow,
    isGrabTool,
    isHoseTool,
    isLaserTool,
    isBeamTool,
    getPhase: () => phase,
    getSpraying: () => spraying,
    setSpraying: (on) => {
      spraying = on;
    },
    getRemoteHoldStart: () => remoteHoldStart,
    spawnBall,
    fireLaser,
    onLaunched: () => {
      throwsUsed++; // each throw uses one
      lastMotion = simTime;
      if (party) turnActive = true;
      refreshStats();
    },
    closeMenu,
    restart,
    frameCamera,
  });

// ---------- gem glints ----------
const gemFx = createGemFx({
  glow,
  blocks,
  balls,
  getExtras: () => QUALITY_SETTINGS[quality].extras,
  speedOf,
  getRadiusScale: () => params.radiusScale,
});
const { sparkleGems, updateTrails } = gemFx;

// ---------- debug panel (development builds only) ----------
if (import.meta.env.DEV) await createDebugPanel(world, params);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // offline support is optional
  });
}

// ---------- main loop ----------
initMusic();
unlockOnFirstGesture();
showTitle();
startTranslating();

let lastFrameAt = performance.now();
let acc = 0;
let captureMode = false; // a capture script drives tick() frame by frame instead of the browser

function frame(now: number) {
  if (!captureMode) tick(now);
  requestAnimationFrame(frame);
}

function tick(now: number) {
  const dt = Math.min((now - lastFrameAt) / 1000, 0.25);
  acc += now < physics.getSlowUntil() ? dt * SLOWMO_SCALE : dt;
  lastFrameAt = now;
  let steps = 0;
  while (acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
    stepPhysics();
    acc -= STEP;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) acc = 0; // spiral-of-death guard
  // effects slow down with the sim, so slow-mo reads as bullet time
  const fxDt = now < physics.getSlowUntil() ? dt * SLOWMO_SCALE : dt;
  for (const e of blocks) if (e.squash > 0) e.squash = Math.max(0, e.squash - fxDt / SQUASH_SECONDS);
  syncRender(acc / STEP);
  applyKeys(dt);
  if (cam.introT < 1) updateIntro(dt);
  else {
    if (phase === 'won') orbitCamera(WIN_ORBIT_SPEED * dt);
    controls.update();
  }
  if (!physicsIdle) renderer.shadowMap.needsUpdate = true; // shadows only change while bodies move
  if (beamLeft > 0) {
    beamLeft -= dt;
    beamMat.opacity = Math.max(beamLeft, 0) / BEAM_SECONDS;
    if (beamLeft <= 0 && !spraying) beam.visible = false;
  }
  updateAimPreview(now);
  updateGrabHighlight(now);
  if (now - lastRemoteCheck > 250) {
    lastRemoteCheck = now;
    updateRemoteState();
  }
  if (!spraying) jet.visible = false;
  sparkleGems(dt);
  characters.updateCharacters(dt);
  characters.updateNearMisses();
  updateCrowd(dt);
  fireworks.updateFireworks(now);
  worldTheme.updateSails(dt);
  updateTrails();
  particles.update(fxDt, params.gravity);
  sparks.update(fxDt);
  debris.update(fxDt, params.gravity);
  const pixelsPerUnit = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  smoke.update(fxDt, pixelsPerUnit);
  glow.update(fxDt, pixelsPerUnit);
  shockwaves.update(fxDt, camera);
  shake.update(dt);
  push += ((now < physics.getSlowUntil() ? SLOWMO_PUSH : 0) - push) * Math.min(dt * 4, 1);
  pushOffset.copy(controls.target).sub(camera.position).multiplyScalar(push).add(shake.offset);
  camera.position.add(pushOffset); // shake and push-in move only the rendered frame, not the orbit state
  renderer.render(scene, camera);
  camera.position.sub(pushOffset);
}
requestAnimationFrame(frame);

// test hook for smoke tests
(window as unknown as { __blox: unknown }).__blox = {
  levels,
  blocks,
  balls,
  chars,
  loadLevel: (i: number) => {
    startSolo(i);
    skipIntro();
    ui.hideMenu();
  },
  phase: () => phase,
  states: blockStates,
  step: (n: number) => {
    for (let i = 0; i < n; i++) stepPhysics();
  },
  remoteUrl: () => remoteHost?.urlFor(0) ?? null,
  awake: () =>
    blocks.filter((e) => e.status !== 'removed' && BLOCKS[e.type].mobile && !e.body.isSleeping()).length,
  launch,
  party: () => party,
  grabAt: (px: number, py: number) => {
    aim.x = px;
    aim.y = py;
    return isGrabTool() && beginGrab(px, py);
  },
  release: () => {
    grab.entity = null;
  },
  holding: () => grab.entity?.type ?? null,
  aim,
  showTitle,
  /** Capture mode stops the browser-driven loop and hides the UI; advance with frameStep(ms). */
  capture: (on: boolean) => {
    captureMode = on;
    document.body.classList.toggle('capture', on);
  },
  frameStep: (ms: number) => tick(lastFrameAt + ms),
  crowdScreen: () =>
    crowd.map((c) => {
      const v = c.entity.currPos.clone().project(camera);
      return {
        x: ((v.x + 1) / 2) * innerWidth,
        y: ((1 - v.y) / 2) * innerHeight,
        onScreen: Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9 && v.z < 1,
      };
    }),
  crowdDebug: () =>
    crowd
      .filter((c) => c.entity.currPos.distanceTo(c.home) > 0.05)
      .map((c) => ({
        at: c.entity.currPos.toArray().map((n) => Math.round(n * 10) / 10),
        asleep: c.entity.body.isSleeping(),
        speed: Math.round(speedOf(c.entity.body) * 100) / 100,
        awayFor: Math.round(c.awayFor * 100) / 100,
      })),
  crowdState: () => crowd.map((c) => Math.round(c.entity.currPos.distanceTo(c.home) * 100) / 100),
  cameraInfo: () => {
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const r = (n: number) => Math.round(n * 100) / 100;
    return { theta: r(spherical.theta), phi: r(spherical.phi), dist: r(spherical.radius) };
  },
};
