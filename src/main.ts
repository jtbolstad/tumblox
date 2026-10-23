import RAPIER from '@dimforge/rapier3d-compat';
import GUI from 'lil-gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  type ImpactKind,
  isMuted,
  playBoom,
  playImpact,
  playLaser,
  playNote,
  playResult,
  playScore,
  playVanish,
  setMuted,
  unlockAudio,
} from './audio';
import { BLOCKS, type BlockType } from './blocks';
import { disposeMesh, makeZoneMesh, Particles, Shake } from './fx';
import { type Level, loadBundledLevels } from './level';
import { markTexture } from './marks';
import { initMusic, isMusicOn, setMusicOn } from './music';
import {
  createParty,
  endDuelTurn,
  endJengaTurn,
  type Party,
  partyModeFor,
  playerLabel,
  topple,
  totalTurns,
} from './party';
import { loadProgress, recordResult } from './progress';
import {
  type BlockState,
  type BlockStatus,
  blockScore,
  finalScore,
  isSettled,
  medalFor,
  outcome,
  zoneMultiplier,
} from './rules';
import { chargeTier, type PointerSample, powerTier, releaseVelocity } from './throw';
import { TOOL_IDS, TOOLS, type ToolId } from './tools';
import { createUi } from './ui';

const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const MAX_BALLS = 12;
const BALL_FLIGHT_SECONDS = 6; // a ball counts as "in motion" for this long after launch
const FALL_MARGIN = 0.3; // a block is fallen once its centre drops this far below the platform top
const BLAST_RADIUS = 3.2;
const BLAST_DELTA_V = 9; // m/s at the centre of an explosion
const CHAIN_DELAY = 0.15; // s between a blast and the bombs it sets off
const HIT_COOLDOWN = 0.2; // s before the same multi-hit block can lose another hit
const BOMB_BALL_TRIGGER_SPEED = 3; // m/s
const SLOWMO_SCALE = 0.4;
const FIREWORK_LAUNCH_SPEED = 14; // m/s upward
const FIREWORK_FUSE = 0.7; // s from launch to burst
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
const KEY_AIM_SPEED = 520; // px/s the keyboard crosshair moves
const KEY_ORBIT_SPEED = 1.2; // rad/s for Q/E
const INFINITE_TURNS = 999; // Jenga-off has no throw limit
const QUALITIES = ['low', 'medium', 'high'] as const;
type Quality = (typeof QUALITIES)[number];
const QUALITY_SETTINGS: Record<Quality, { pixelRatio: number; shadowMap: number }> = {
  low: { pixelRatio: 1, shadowMap: 512 },
  medium: { pixelRatio: 1.5, shadowMap: 1024 },
  high: { pixelRatio: 2, shadowMap: 2048 },
};

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

interface Entity {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  prevPos: THREE.Vector3;
  currPos: THREE.Vector3;
  prevRot: THREE.Quaternion;
  currRot: THREE.Quaternion;
}

interface BlockEntity extends Entity {
  type: BlockType;
  status: BlockStatus;
  mesh: THREE.InstancedMesh;
  instance: number; // index into the per-type InstancedMesh
  size: THREE.Vector3;
  exploding: boolean;
  hitsLeft: number; // vanish blocks: hard hits remaining
  lastHit: number; // sim time of the last counted hit, so one impact is not counted per contact
  note: number; // jingle blocks: index into JINGLE_NOTES, so a row plays a tune
  multiplier: number; // zone multiplier at its current floor position
  startPos: THREE.Vector3; // where the level placed it, to measure Jenga pulls and collapse
  grabbedOnce: boolean;
}

interface BallEntity extends Entity {
  mesh: THREE.Mesh;
  age: number;
  tool: ToolId;
  exploding: boolean;
}

type Blaster = BlockEntity | BallEntity;

type Phase = 'menu' | 'playing' | 'won' | 'lost';

await RAPIER.init();

// ---------- renderer / scene ----------
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.autoUpdate = false; // re-rendered only while something moves, see frame()
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ecae6);
scene.fog = new THREE.Fog(0x8ecae6, 40, 90);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
camera.position.set(0, 5, 14);

scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa77, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(8, 16, 6);
sun.castShadow = true; // the one shadow light
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x7bc47f, roughness: 1 }),
);
ground.receiveShadow = true;
scene.add(ground);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2.5, 0);
controls.enableDamping = true;
controls.minDistance = 6;
controls.maxDistance = 35;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
// left button / one finger = throw; right button / two fingers = orbit + pinch
controls.mouseButtons = { LEFT: -1 as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: -1 as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.update();

let quality: Quality = readQuality();

function readQuality(): Quality {
  try {
    const saved = localStorage.getItem('blox.quality.v1');
    if (saved && (QUALITIES as readonly string[]).includes(saved)) return saved as Quality;
  } catch {
    // storage blocked: fall through to the default
  }
  return matchMedia('(pointer: coarse)').matches ? 'medium' : 'high'; // phones start lighter
}

function applyQuality() {
  const q = QUALITY_SETTINGS[quality];
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
  sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
  sun.shadow.map?.dispose();
  sun.shadow.map = null; // reallocated at the new size on the next shadow render
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
applyQuality();

// ---------- physics ----------
const world = new RAPIER.World({ x: 0, y: -params.gravity, z: 0 });
world.timestep = STEP;
world.integrationParameters.numSolverIterations = params.solverIterations;
const events = new RAPIER.EventQueue(true);

world.createCollider(RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setTranslation(0, -0.5, 0).setFriction(0.9));

const blocks: BlockEntity[] = [];
const balls: BallEntity[] = [];
const colliderOwner = new Map<number, BlockEntity | BallEntity>();
const blockMeshes: THREE.InstancedMesh[] = [];
let platformCollider: RAPIER.Collider | null = null;
let platformMesh: THREE.Mesh | null = null;
const zoneMeshes: THREE.Mesh[] = [];
const particles = new Particles(scene);
const shake = new Shake();

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

function makeEntityBase(body: RAPIER.RigidBody, collider: RAPIER.Collider): Entity {
  const t = body.translation();
  const r = body.rotation();
  const pos = new THREE.Vector3(t.x, t.y, t.z);
  const rot = new THREE.Quaternion(r.x, r.y, r.z, r.w);
  return { body, collider, prevPos: pos.clone(), currPos: pos, prevRot: rot.clone(), currRot: rot };
}

// ---------- game state ----------
const levels = loadBundledLevels();
let levelIndex = 0;
let level: Level = levels[0];
let phase: Phase = 'menu';
let throwsUsed = 0;
let simTime = 0;
let lastMotion = 0;
const pendingBlasts: { entity: Blaster; at: number }[] = [];
const pendingLaunches: { entity: BlockEntity; at: number }[] = []; // fireworks waiting to lift off
let collapsed = false; // a Jenga tower block (never grabbed) was knocked out of place
let party: Party | null = null; // hot-seat game in progress, null for solo play
let turnActive = false; // party: the current player has acted and the scene is still resolving
let turnBaseline = 0; // party duel: block score when the turn started
let spraying = false; // hose held down
let beamLeft = 0; // s the laser beam stays visible
let physicsIdle = true; // everything asleep: world.step is skipped

const ui = createUi({
  onSelect: (i, players) => {
    if (players > 1) startParty(i, players);
    else startSolo(i);
    ui.hideMenu();
  },
  onRetry: () => restart(),
  onNext: () => startSolo(Math.min(levelIndex + 1, levels.length - 1)),
  onOpenMenu: () => {
    phase = 'menu';
    ui.showMenu(levels, loadProgress());
  },
});

function blockStates(): BlockState[] {
  return blocks.map((b) => ({ type: b.type, status: b.status, multiplier: b.multiplier }));
}

function totalThrows() {
  if (!party) return level.throws;
  return party.mode === 'duel' ? totalTurns(party) : INFINITE_TURNS;
}

function throwsLeft() {
  // hose water is spent continuously, so round up: a sliver of water still counts as a second
  return Math.max(0, Math.ceil(totalThrows() - throwsUsed - 1e-6));
}

let lastStats = '';
function refreshStats() {
  const left = throwsLeft();
  const score = blockScore(blockStates());
  const key = `${left}/${score}`;
  if (key === lastStats) return;
  lastStats = key;
  ui.setStats(left, score);
}

function startSolo(index: number) {
  party = null;
  loadLevel(index);
}

function startParty(index: number, players: number) {
  const lvl = levels[index];
  const mode = partyModeFor(lvl);
  if (!mode) return startSolo(index);
  party = createParty(mode, players, lvl.throws);
  loadLevel(index);
  announceTurn();
}

function restart() {
  if (party) startParty(levelIndex, party.players);
  else loadLevel(levelIndex);
}

function refreshParty() {
  if (!party) {
    ui.setParty(null);
    return;
  }
  const p = party;
  ui.setParty(
    p.scores.map((score, i) => ({
      name: playerLabel(i),
      score: p.mode === 'duel' ? score : null,
      active: i === p.current && !p.winners,
      out: p.out[i],
    })),
  );
}

function announceTurn() {
  if (!party) return;
  turnBaseline = blockScore(blockStates());
  ui.toast(`${playerLabel(party.current)}'s turn`);
  refreshParty();
}

/** Party: the current player's throw has resolved. Score it and pass the turn. */
function endPartyTurn() {
  if (!party) return;
  turnActive = false;
  const who = party.current;
  if (party.mode === 'duel') {
    const score = blockScore(blockStates());
    const gained = score - turnBaseline;
    turnBaseline = score; // set now: the next player may act before the toast ends
    endDuelTurn(party, gained);
    ui.toast(`${playerLabel(who)} ${gained > 0 ? '+' : ''}${gained}`);
    if (!party.winners) setTimeout(announceTurn, 900);
  } else {
    endJengaTurn(party);
    if (!party.winners) announceTurn();
  }
  refreshParty();
  if (party.winners) finishParty();
}

/** Party: the Jenga tower fell on the current player's watch. */
function partyTopple() {
  if (!party) return;
  const p = party;
  const loser = p.current;
  const rebuild = topple(p);
  playResult(false);
  refreshParty();
  if (!rebuild) return finishParty();
  phase = 'lost'; // freeze the sim until the rebuild
  ui.toast(`${playerLabel(loser)} toppled it!`);
  setTimeout(() => {
    if (party !== p || phase !== 'lost') return; // the player left or restarted meanwhile
    loadLevel(levelIndex);
    announceTurn();
  }, 1600);
}

function finishParty() {
  if (!party?.winners) return;
  phase = 'won';
  playResult(true);
  const names = party.winners.map(playerLabel).join(' & ');
  const detail =
    party.mode === 'duel'
      ? party.scores.map((s, i) => `${playerLabel(i)} ${s}`).join(' · ')
      : `${names} is the last one standing${party.winners.length > 1 ? ' (turn limit reached)' : ''}`;
  ui.showPartyResult(party.winners.length === 1 ? `${names} wins!` : `Tie: ${names}`, detail);
}

function clearLevel() {
  for (const b of blocks) if (b.status !== 'removed') world.removeRigidBody(b.body); // removed ones are already gone
  blocks.length = 0;
  for (const m of blockMeshes) {
    scene.remove(m);
    m.dispose();
  }
  blockMeshes.length = 0;
  for (const b of balls) removeBallBody(b);
  balls.length = 0;
  colliderOwner.clear();
  pendingBlasts.length = 0;
  pendingLaunches.length = 0;
  if (platformCollider) world.removeCollider(platformCollider, false);
  if (platformMesh) {
    scene.remove(platformMesh);
    platformMesh.geometry.dispose();
  }
  for (const z of zoneMeshes) {
    scene.remove(z);
    disposeMesh(z);
  }
}

function loadLevel(index: number) {
  clearLevel();
  levelIndex = index;
  level = levels[index];
  throwsUsed = 0;
  simTime = 0;
  lastMotion = 0;
  lastStats = '';
  collapsed = false;
  grab.entity = null;
  turnActive = false;
  spraying = false;
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
  platformMesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, top, sz),
    new THREE.MeshStandardMaterial({ color: 0xb08968, roughness: 0.9 }),
  );
  platformMesh.position.set(0, top / 2, 0);
  platformMesh.receiveShadow = true;
  platformMesh.castShadow = true;
  scene.add(platformMesh);
  zoneMeshes.length = 0;
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
    const def = BLOCKS[type];
    const mesh = new THREE.InstancedMesh(
      boxGeo,
      new THREE.MeshStandardMaterial({
        color: def.color,
        map: markTexture(type), // shape marking, so types differ by more than colour
        roughness: type === 'gem' ? 0.25 : 0.6,
        metalness: type === 'gem' ? 0.3 : 0,
      }),
      count,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    blockMeshes.push(mesh);
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
    if (def.mobile) body.sleep(); // blocks spawn asleep; attaching the collider woke the body
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
    };
    blocks.push(entity);
    colliderOwner.set(collider.handle, entity);
  }

  frameCamera();
  syncRender(1);
  refreshStats();
  ui.setLevel(level);
  refreshParty();
  renderer.shadowMap.needsUpdate = true;
}

function frameCamera() {
  let maxY = 0;
  let maxX = 0;
  for (const b of level.blocks) {
    maxY = Math.max(maxY, b.pos[1] + b.size[1] / 2);
    maxX = Math.max(maxX, Math.abs(b.pos[0]) + b.size[0] / 2);
  }
  const top = level.platform.top;
  const dist = Math.min(Math.max(9 + maxY * 1.4 + maxX * 1.2, 11), 26);
  controls.target.set(0, top + maxY / 2, 0);
  camera.position.set(0, top + maxY * 0.7 + 2.5, dist);
  controls.update();
}

// ---------- balls ----------
const ballGeo = new THREE.SphereGeometry(1, 24, 16);
const toolMats = Object.fromEntries(
  TOOL_IDS.map((id) => [id, new THREE.MeshStandardMaterial({ color: TOOLS[id].color, roughness: 0.35 })]),
) as Record<ToolId, THREE.MeshStandardMaterial>;

function spawnBall(origin: THREE.Vector3, velocity: THREE.Vector3) {
  const tool = TOOLS[level.tool];
  const r = tool.radius * params.radiusScale;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(origin.x, origin.y, origin.z)
      .setLinvel(velocity.x, velocity.y, velocity.z)
      .setCcdEnabled(true), // fast balls must not tunnel through blocks
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.ball(r)
      .setMass(tool.mass * params.massScale)
      .setFriction(tool.friction)
      .setRestitution(tool.restitution)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    body,
  );
  const mesh = new THREE.Mesh(ballGeo, toolMats[level.tool]);
  mesh.scale.setScalar(r);
  mesh.castShadow = true;
  scene.add(mesh);
  const ball: BallEntity = {
    ...makeEntityBase(body, collider),
    mesh,
    age: 0,
    tool: level.tool,
    exploding: false,
  };
  balls.push(ball);
  colliderOwner.set(collider.handle, ball);
  if (balls.length > MAX_BALLS) {
    const oldest = balls.shift();
    if (oldest) removeBallBody(oldest);
  }
}

function removeBallBody(e: BallEntity) {
  colliderOwner.delete(e.collider.handle);
  world.removeRigidBody(e.body);
  scene.remove(e.mesh);
}

// ---------- behaviours: explode / vanish ----------
function removeBlock(e: BlockEntity) {
  if (e.status === 'removed') return;
  e.status = 'removed';
  colliderOwner.delete(e.collider.handle);
  world.removeRigidBody(e.body);
  e.mesh.setMatrixAt(e.instance, hiddenMatrix);
  e.mesh.instanceMatrix.needsUpdate = true;
}

function scheduleBlast(e: Blaster, delay: number) {
  if (e.exploding || ('status' in e && e.status === 'removed')) return;
  e.exploding = true;
  pendingBlasts.push({ entity: e, at: simTime + delay });
}

/** Launch a fireworks block upward; it bursts after the fuse. */
function ignite(e: BlockEntity, delay = 0) {
  if (e.exploding || e.status === 'removed') return;
  pendingLaunches.push({ entity: e, at: simTime + delay });
  scheduleBlast(e, delay + FIREWORK_FUSE);
}

const blastCenter = new THREE.Vector3();
const blastDir = new THREE.Vector3();
let recentBlasts: number[] = [];
let slowUntil = 0; // performance.now() time until which the sim runs in slow motion

function detonate(source: Blaster) {
  blastCenter.copy(source.currPos);
  particles.burst(blastCenter, 0xffa94d, 40, 9);
  particles.burst(blastCenter, 0xe63946, 20, 6);
  shake.kick(0.35);
  playBoom();
  // three blasts inside ~1 s is a chain reaction: slow down so it reads
  const now = performance.now();
  recentBlasts = recentBlasts.filter((t) => now - t < 1200);
  recentBlasts.push(now);
  if (recentBlasts.length >= 3) slowUntil = now + 1000;
  if ('type' in source) {
    removeBlock(source);
  } else {
    const i = balls.indexOf(source);
    if (i >= 0) balls.splice(i, 1);
    removeBallBody(source);
  }
  const targets: Blaster[] = [...blocks, ...balls];
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

const IMPACT_BY_TYPE: Partial<Record<BlockType, ImpactKind>> = {
  wood: 'wood',
  steel: 'metal',
  gem: 'glass',
  ice: 'glass',
};

function impactKind(a: Blaster | undefined, b: Blaster | undefined): ImpactKind {
  for (const e of [a, b])
    if (e && 'type' in e && IMPACT_BY_TYPE[e.type]) return IMPACT_BY_TYPE[e.type] as ImpactKind;
  return 'thud';
}

/** Run a block's behaviour for an impact of `speed` m/s; `a` and `b` are the two colliding entities. */
function triggerBlock(
  e: BlockEntity,
  speed: number,
  a: Blaster | undefined,
  b: Blaster | undefined,
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
  } else if (def.behaviour === 'jingle' && simTime - e.lastHit > HIT_COOLDOWN) {
    e.lastHit = simTime;
    playNote(JINGLE_NOTES[e.note]);
  } else if (def.behaviour === 'vanish' && simTime - e.lastHit > HIT_COOLDOWN) {
    e.lastHit = simTime;
    e.hitsLeft--;
    if (e.hitsLeft <= 0) toVanish.add(e);
  }
}

function vanishAll(toVanish: Set<BlockEntity>) {
  for (const e of toVanish) {
    particles.burst(e.currPos, BLOCKS[e.type].color, 14, 4);
    playVanish();
    removeBlock(e);
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

// ---------- laser and hose ----------
const beamGeo = new THREE.BufferGeometry();
beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const beamMat = new THREE.LineBasicMaterial({ color: 0xff3864, transparent: true, depthTest: false });
const beam = new THREE.Line(beamGeo, beamMat);
beam.renderOrder = 11;
beam.frustumCulled = false;
beam.visible = false;
scene.add(beam);

const nozzle = new THREE.Vector3();
const beamEnd = new THREE.Vector3();
const beamDir = new THREE.Vector3();
const sprayHit = new THREE.Vector3();

/** Where beams start: just in front of the camera, slightly below the view centre (same as a thrown ball). */
function updateNozzle() {
  camera.getWorldDirection(beamDir);
  nozzle.copy(camera.position).addScaledVector(beamDir, 1.5);
  nozzle.y -= 0.6;
}

function showBeam(color: number, opacity: number) {
  const pos = beamGeo.getAttribute('position') as THREE.BufferAttribute;
  pos.setXYZ(0, nozzle.x, nozzle.y, nozzle.z);
  pos.setXYZ(1, beamEnd.x, beamEnd.y, beamEnd.z);
  pos.needsUpdate = true;
  beamMat.color.setHex(color);
  beamMat.opacity = opacity;
  beam.visible = true;
}

/** Cast the camera ray through a screen point; fills `beamEnd`/`beamDir` and returns the hit, if any. */
function castBeam(px: number, py: number, range: number) {
  ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const ray = raycaster.ray;
  const hit = world.castRay(new RAPIER.Ray(ray.origin, ray.direction), range, true);
  beamEnd
    .copy(ray.direction)
    .multiplyScalar(hit ? hit.timeOfImpact : range)
    .add(ray.origin);
  updateNozzle();
  beamDir.copy(beamEnd).sub(nozzle).normalize();
  return hit;
}

/** Instant hit: a small nudge plus the block's hit behaviour (pops bombs, vanish and jingle blocks). */
function fireLaser(px: number, py: number) {
  const hit = castBeam(px, py, 80);
  playLaser();
  beamLeft = BEAM_SECONDS;
  showBeam(TOOLS.laser.color, 1);
  if (!hit) return;
  particles.burst(beamEnd, TOOLS.laser.color, 8, 3);
  const owner = colliderOwner.get(hit.collider.handle);
  if (!owner || !('type' in owner) || !BLOCKS[owner.type].mobile) return;
  owner.body.applyImpulseAtPoint(beamDir.clone().multiplyScalar(LASER_IMPULSE), beamEnd, true);
  const toVanish = new Set<BlockEntity>();
  triggerBlock(owner, LASER_SPEED, owner, undefined, toVanish);
  vanishAll(toVanish);
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
  showBeam(TOOLS.hose.color, 0.55);
  if (!hit) return;
  sprayHit.copy(beamEnd);
  if (Math.random() < 0.5) particles.burst(sprayHit, TOOLS.hose.color, 1, 2);
  const direct = colliderOwner.get(hit.collider.handle);
  const reach = HOSE_SPLASH + 0.6;
  for (const e of blocks) {
    if (e.status === 'removed' || !BLOCKS[e.type].mobile) continue;
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
  if (pendingBlasts.length > 0 || pendingLaunches.length > 0 || grab.entity || spraying) return false;
  for (const b of balls) if (!b.body.isSleeping()) return false;
  for (const e of blocks) {
    if (e.status !== 'removed' && BLOCKS[e.type].mobile && !e.body.isSleeping()) return false;
  }
  return true;
}

// ---------- fixed step + interpolation ----------
function capture(e: Entity) {
  const t = e.body.translation();
  const r = e.body.rotation();
  e.prevPos.copy(e.currPos);
  e.prevRot.copy(e.currRot);
  e.currPos.set(t.x, t.y, t.z);
  e.currRot.set(r.x, r.y, r.z, r.w);
}

const tmpPos = new THREE.Vector3();
const tmpRot = new THREE.Quaternion();
const tmpMat = new THREE.Matrix4();

function syncRender(alpha: number) {
  for (const e of blocks) {
    if (e.status === 'removed') continue;
    tmpPos.lerpVectors(e.prevPos, e.currPos, alpha);
    tmpRot.slerpQuaternions(e.prevRot, e.currRot, alpha);
    tmpMat.compose(tmpPos, tmpRot, e.size);
    e.mesh.setMatrixAt(e.instance, tmpMat);
  }
  for (const m of blockMeshes) m.instanceMatrix.needsUpdate = true;
  for (const e of balls) {
    e.mesh.position.lerpVectors(e.prevPos, e.currPos, alpha);
    e.mesh.quaternion.slerpQuaternions(e.prevRot, e.currRot, alpha);
  }
}

function speedOf(body: RAPIER.RigidBody) {
  const v = body.linvel();
  return Math.hypot(v.x, v.y, v.z);
}

const popupPos = new THREE.Vector3();

/** Floating "+100" / "-100" where a scoring block fell, so the player sees what counted. */
function popupFor(e: BlockEntity) {
  const points = BLOCKS[e.type].points;
  if (points === 0) return;
  popupPos.copy(e.currPos);
  popupPos.y = Math.max(popupPos.y, level.platform.top) + 0.8; // above the block, not under the ground
  popupPos.project(camera);
  if (popupPos.z > 1) return; // behind the camera
  particles.burst(e.currPos, BLOCKS[e.type].color, 10, 4);
  playScore();
  ui.popup(
    `${points > 0 ? '+' : ''}${points}`,
    ((popupPos.x + 1) / 2) * innerWidth,
    ((1 - popupPos.y) / 2) * innerHeight,
    points < 0,
  );
}

function stepPhysics() {
  applyGrabForce();
  applyHose();
  physicsIdle = worldAsleep();
  if (!physicsIdle) world.step(events);
  simTime += STEP;
  handleImpacts();

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

  const fallY = level.platform.top - FALL_MARGIN;
  let moving = pendingBlasts.length > 0 || grab.entity !== null || spraying; // holding or soaking is never "settled"
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
  const result = outcome(level.goal, states, throwsLeft(), collapsed);
  if (result === 'playing') return;
  phase = result;
  if (result === 'won') {
    const score = finalScore(states, throwsLeft());
    const medal = medalFor(score, level.medals);
    const saved = recordResult(level.id, score, medal);
    playResult(true);
    ui.showResult({ won: true, score, medal, best: saved.best, hasNext: levelIndex < levels.length - 1 });
  } else {
    playResult(false);
    ui.showResult({
      won: false,
      score: 0,
      medal: null,
      best: 0,
      hasNext: false,
      lostReason: collapsed ? 'The tower fell!' : undefined,
    });
  }
}

// ---------- flick to throw ----------
const hudTier = document.getElementById('tier') as HTMLElement;
const hudFlick = document.getElementById('flick') as HTMLElement;
const tierNames = ['tap', 'light', 'medium', 'full'];

const raycaster = new THREE.Raycaster();
let samples: PointerSample[] = [];
let throwPointer: number | null = null;
const activeTouches = new Set<number>();

function canThrow() {
  return phase === 'playing' && throwsLeft() > 0 && !turnActive; // party: one action per turn
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

// ---------- grab: pick a block and drag it on a soft spring ----------
const grab = {
  entity: null as BlockEntity | null,
  local: new THREE.Vector3(), // grip point in the block's local space
  planeY: 0, // the pointer drags the grip along this horizontal plane, so pulling toward the camera works
};
const grabPoint = new THREE.Vector3();
const grabTarget = new THREE.Vector3();
const grabAccel = new THREE.Vector3();
const gripRot = new THREE.Quaternion();

/** The mobile block under a screen point, and where the ray hits it. */
function pickBlock(px: number, py: number): { entity: BlockEntity; point: THREE.Vector3 } | null {
  ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const ray = raycaster.ray;
  const hit = world.castRay(new RAPIER.Ray(ray.origin, ray.direction), 200, true);
  const owner = hit ? colliderOwner.get(hit.collider.handle) : undefined;
  if (!hit || !owner || !('type' in owner) || !BLOCKS[owner.type].mobile) return null;
  return { entity: owner, point: ray.direction.clone().multiplyScalar(hit.timeOfImpact).add(ray.origin) };
}

function beginGrab(px: number, py: number): boolean {
  const pick = pickBlock(px, py);
  if (!pick) return false;
  grab.planeY = pick.point.y;
  grabTarget.copy(pick.point);
  grab.local
    .copy(pick.point)
    .sub(pick.entity.currPos)
    .applyQuaternion(gripRot.copy(pick.entity.currRot).invert());
  grab.entity = pick.entity;
  pick.entity.grabbedOnce = true;
  throwsUsed++; // each pick-up uses one grab
  if (party) turnActive = true;
  lastMotion = simTime;
  refreshStats();
  return true;
}

/** Accelerate the held block toward the pointer; capped, so yanking too hard wobbles the stack. */
function applyGrabForce() {
  const e = grab.entity;
  if (!e) return;
  if (e.status === 'removed') {
    grab.entity = null;
    return;
  }
  ndc.set((aim.x / innerWidth) * 2 - 1, -(aim.y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const ray = raycaster.ray;
  // intersect the pointer ray with the grip plane; a ray that never reaches it keeps the last target
  if (ray.direction.y < -0.02) {
    const t = Math.min((grab.planeY - ray.origin.y) / ray.direction.y, 80);
    grabTarget.copy(ray.direction).multiplyScalar(t).add(ray.origin);
  }

  const r = e.body.rotation();
  const t = e.body.translation();
  const v = e.body.linvel();
  grabPoint
    .copy(grab.local)
    .applyQuaternion(gripRot.set(r.x, r.y, r.z, r.w))
    .add(t as THREE.Vector3);
  grabAccel.copy(grabTarget).sub(grabPoint).multiplyScalar(params.grabStiffness);
  grabAccel.x -= v.x * params.grabDamping;
  grabAccel.y -= v.y * params.grabDamping;
  grabAccel.z -= v.z * params.grabDamping;
  grabAccel.clampLength(0, params.grabMaxAccel);
  grabAccel.y += params.gravity * 0.95; // carry most of the weight so the block can be lifted out
  e.body.applyImpulseAtPoint(grabAccel.multiplyScalar(e.body.mass() * STEP), grabPoint, true);
}

const muteBtn = document.getElementById('mute-btn') as HTMLElement;
function showMute() {
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
}
showMute();
muteBtn.addEventListener('click', () => {
  setMuted(!isMuted());
  showMute();
  unlockAudio();
});

const musicBtn = document.getElementById('music-btn') as HTMLElement;
function showMusic() {
  musicBtn.style.opacity = isMusicOn() ? '1' : '0.5';
  musicBtn.setAttribute('aria-pressed', String(isMusicOn()));
}
showMusic();
musicBtn.addEventListener('click', () => {
  setMusicOn(!isMusicOn());
  showMusic();
  unlockAudio();
});

const qualityBtn = document.getElementById('quality-btn') as HTMLElement;
function showQuality() {
  qualityBtn.textContent = quality[0].toUpperCase() + quality.slice(1);
}
showQuality();
qualityBtn.addEventListener('click', () => {
  quality = QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length];
  try {
    localStorage.setItem('blox.quality.v1', quality);
  } catch {
    // ignore: the choice just is not remembered
  }
  applyQuality();
  showQuality();
});

canvas.addEventListener('pointerdown', (ev) => {
  unlockAudio(); // browsers start audio only after a user gesture
  if (ev.pointerType === 'touch') {
    activeTouches.add(ev.pointerId);
    if (activeTouches.size > 1) {
      throwPointer = null; // second finger = orbit/pinch, cancel the throw
      grab.entity = null;
      spraying = false;
      return;
    }
  }
  if (ev.button !== 0 || throwPointer !== null || !canThrow()) return;
  aim.x = ev.clientX;
  aim.y = ev.clientY;
  if (isGrabTool() && !beginGrab(ev.clientX, ev.clientY)) return;
  if (isHoseTool()) spraying = true;
  throwPointer = ev.pointerId;
  aim.visible = true;
  samples = [{ t: ev.timeStamp, x: ev.clientX, y: ev.clientY }];
  canvas.setPointerCapture(ev.pointerId);
});

canvas.addEventListener('pointermove', (ev) => {
  aim.x = ev.clientX;
  aim.y = ev.clientY;
  if (ev.pointerId === throwPointer) {
    samples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
    if (samples.length > 64) samples.shift();
  }
  // touch has no hover: preview only while a finger is down
  aim.visible = ev.pointerType === 'mouse' || throwPointer !== null;
});

canvas.addEventListener('pointerleave', (ev) => {
  if (ev.pointerType === 'mouse') aim.visible = false;
});

function endPointer(ev: PointerEvent, doThrow: boolean) {
  activeTouches.delete(ev.pointerId);
  if (ev.pointerId !== throwPointer) return;
  throwPointer = null;
  if (ev.pointerType !== 'mouse') aim.visible = false;
  if (spraying) {
    spraying = false;
    beam.visible = false;
    return;
  }
  if (grab.entity) {
    grab.entity = null; // let go
    return;
  }
  if (!doThrow) return;
  samples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
  const flick = releaseVelocity(samples);
  launch(ev.clientX, ev.clientY, flick.speed);
}
canvas.addEventListener('pointerup', (ev) => endPointer(ev, true));
canvas.addEventListener('pointercancel', (ev) => endPointer(ev, false));

// ---------- keyboard: arrows aim, Space is the one-button throw / grab / spray ----------
const keysDown = new Set<string>();
const AIM_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
let chargeStart: number | null = null; // performance.now() when Space went down on a throwing tool

function flickForTier(tier: number) {
  return [0, params.flickLight, params.flickMedium, params.flickFull][tier];
}

function spaceDown() {
  if (phase !== 'playing') return;
  if (isGrabTool()) {
    if (grab.entity) grab.entity = null;
    else if (canThrow()) beginGrab(aim.x, aim.y);
  } else if (isHoseTool()) {
    if (canThrow()) spraying = true;
  } else if (isLaserTool()) {
    launch(aim.x, aim.y, 0);
  } else if (canThrow()) {
    chargeStart = performance.now();
  }
}

function spaceUp() {
  if (spraying) {
    spraying = false;
    beam.visible = false;
  }
  if (chargeStart === null) return;
  const tier = chargeTier((performance.now() - chargeStart) / 1000);
  chargeStart = null;
  launch(aim.x, aim.y, flickForTier(tier));
}

addEventListener('keydown', (ev) => {
  unlockAudio();
  if (ev.code === 'Space') {
    ev.preventDefault();
    if (!ev.repeat) spaceDown();
  } else if (ev.code === 'KeyR' && phase !== 'menu') {
    restart();
  } else if (AIM_KEYS.includes(ev.code) || ['KeyQ', 'KeyE', 'KeyZ', 'KeyX'].includes(ev.code)) {
    ev.preventDefault();
    keysDown.add(ev.code);
  }
});

addEventListener('keyup', (ev) => {
  keysDown.delete(ev.code);
  if (ev.code === 'Space') spaceUp();
});

addEventListener('blur', () => {
  keysDown.clear();
  chargeStart = null;
  spraying = false;
});

const orbitOffset = new THREE.Vector3();

/** Move the aim crosshair and orbit/zoom the camera from held keys. */
function applyKeys(dt: number) {
  if (keysDown.size === 0 || phase === 'menu') return;
  const dx = (keysDown.has('ArrowRight') ? 1 : 0) - (keysDown.has('ArrowLeft') ? 1 : 0);
  const dy = (keysDown.has('ArrowDown') ? 1 : 0) - (keysDown.has('ArrowUp') ? 1 : 0);
  if (dx || dy) {
    aim.x = Math.min(Math.max(aim.x + dx * KEY_AIM_SPEED * dt, 0), innerWidth);
    aim.y = Math.min(Math.max(aim.y + dy * KEY_AIM_SPEED * dt, 0), innerHeight);
    aim.visible = true;
  }
  const turn = (keysDown.has('KeyE') ? 1 : 0) - (keysDown.has('KeyQ') ? 1 : 0);
  const zoom = (keysDown.has('KeyX') ? 1 : 0) - (keysDown.has('KeyZ') ? 1 : 0);
  if (turn || zoom) {
    orbitOffset.copy(camera.position).sub(controls.target);
    orbitOffset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, turn * KEY_ORBIT_SPEED * dt);
    const len = Math.min(
      Math.max(orbitOffset.length() * (1 + zoom * dt), controls.minDistance),
      controls.maxDistance,
    );
    camera.position.copy(controls.target).add(orbitOffset.setLength(len));
    controls.update();
  }
}

const ndc = new THREE.Vector2();
const launchDir = new THREE.Vector3();
const launchOrigin = new THREE.Vector3();
const launchTarget = new THREE.Vector3();

const shot = {
  origin: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  target: new THREE.Vector3(),
  tier: 0 as 0 | 1 | 2 | 3,
};

/** Aim at screen point (px, py) with a flick of `flickSpeed` px/s; fills and returns `shot`. */
function computeShot(px: number, py: number, flickSpeed: number) {
  ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const ray = raycaster.ray;

  const hit = world.castRay(new RAPIER.Ray(ray.origin, ray.direction), 200, true);
  if (hit) launchTarget.copy(ray.direction).multiplyScalar(hit.timeOfImpact).add(ray.origin);
  else launchTarget.copy(ray.direction).multiplyScalar(30).add(ray.origin);

  // spawn just in front of the camera, slightly below the view centre
  camera.getWorldDirection(launchDir);
  launchOrigin.copy(camera.position).addScaledVector(launchDir, 1.5);
  launchOrigin.y -= 0.6;

  launchDir.copy(launchTarget).sub(launchOrigin).normalize();
  launchDir.y += params.upwardBias;
  launchDir.normalize();

  const tier = powerTier(flickSpeed, [params.flickLight, params.flickMedium, params.flickFull]);
  const speed = [params.speedTap, params.speedLight, params.speedMedium, params.speedFull][tier];
  shot.origin.copy(launchOrigin);
  shot.velocity.copy(launchDir).multiplyScalar(speed);
  shot.target.copy(launchTarget);
  shot.tier = tier;
  return shot;
}

function launch(px: number, py: number, flickSpeed: number) {
  if (!canThrow() || isGrabTool() || isHoseTool()) return;
  if (isLaserTool()) {
    fireLaser(px, py);
  } else {
    const s = computeShot(px, py, flickSpeed);
    spawnBall(s.origin, s.velocity);
    hudTier.textContent = tierNames[s.tier];
  }
  throwsUsed++;
  lastMotion = simTime;
  if (party) turnActive = true;
  refreshStats();
}

// ---------- aim preview: target ring + trajectory arc ----------
const tierColors = [0xffffff, 0xffe066, 0xffa94d, 0xff5c5c];
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.35, 0.5, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }),
);
ring.renderOrder = 10;
ring.visible = false;
scene.add(ring);

const ARC_POINTS = 48;
const ARC_DT = 0.05;
const arcGeo = new THREE.BufferGeometry();
arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
const arcMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.8,
  depthTest: false,
});
const arc = new THREE.Line(arcGeo, arcMat);
arc.renderOrder = 10;
arc.frustumCulled = false;
arc.visible = false;
scene.add(arc);

function updateGrabPreview() {
  arc.visible = false;
  // highlight the block that would be picked up; hide while holding one
  const pick = aim.visible && canThrow() && !grab.entity ? pickBlock(aim.x, aim.y) : null;
  ring.visible = pick !== null;
  if (!pick) return;
  ring.position.copy(pick.point);
  ring.lookAt(camera.position);
  (ring.material as THREE.MeshBasicMaterial).color.setHex(tierColors[0]);
}

function updateBeamPreview() {
  arc.visible = false;
  const show = aim.visible && canThrow();
  ring.visible = show;
  if (!show) return;
  const hit = castBeam(aim.x, aim.y, isHoseTool() ? HOSE_RANGE : 80);
  ring.visible = hit !== null;
  if (!hit) return;
  ring.position.copy(beamEnd);
  ring.lookAt(camera.position);
  const color = isHoseTool() ? TOOLS.hose.color : TOOLS.laser.color;
  (ring.material as THREE.MeshBasicMaterial).color.setHex(color);
}

function updateAimPreview(now: number) {
  if (isGrabTool()) {
    updateGrabPreview();
    return;
  }
  if (isBeamTool()) {
    updateBeamPreview();
    return;
  }
  const charging = chargeStart !== null;
  const pressing = throwPointer !== null || charging;
  const show = aim.visible && canThrow();
  ring.visible = arc.visible = show;
  if (!show) return;

  // live flick speed includes "now", so the preview drops as the pointer slows
  const live = pressing && !charging ? [...samples, { t: now, x: aim.x, y: aim.y }] : [];
  const speed =
    chargeStart !== null
      ? flickForTier(chargeTier((performance.now() - chargeStart) / 1000))
      : pressing
        ? releaseVelocity(live).speed
        : 0;
  const s = computeShot(aim.x, aim.y, speed);
  hudTier.textContent = pressing ? tierNames[s.tier] : '-';
  if (pressing) hudFlick.textContent = String(Math.round(speed));

  ring.position.copy(s.target);
  ring.lookAt(camera.position);
  const color = tierColors[s.tier];
  (ring.material as THREE.MeshBasicMaterial).color.setHex(color);
  arcMat.color.setHex(color);

  // ballistic points; the real body also has CCD and damping 0, so this matches until first contact
  const pos = arcGeo.getAttribute('position') as THREE.BufferAttribute;
  let last = 0;
  for (let i = 0; i < ARC_POINTS; i++) {
    const t = i * ARC_DT;
    const y = s.origin.y + s.velocity.y * t - 0.5 * params.gravity * t * t;
    pos.setXYZ(i, s.origin.x + s.velocity.x * t, Math.max(y, 0.02), s.origin.z + s.velocity.z * t);
    last = i;
    if (y < 0) break; // hit the ground
  }
  for (let i = last + 1; i < ARC_POINTS; i++) pos.copyAt(i, pos, last); // collapse unused tail
  pos.needsUpdate = true;
}

// ---------- debug panel ----------
const gui = new GUI({ title: 'Debug' });
gui.add(params, 'gravity', 1, 30).onChange((g: number) => (world.gravity = { x: 0, y: -g, z: 0 }));
gui.add(params, 'massScale', 0.25, 4);
gui.add(params, 'radiusScale', 0.5, 2);
const power = gui.addFolder('Power curve (m/s per tier)');
power.add(params, 'speedTap', 1, 40);
power.add(params, 'speedLight', 1, 40);
power.add(params, 'speedMedium', 1, 40);
power.add(params, 'speedFull', 1, 60);
const flick = gui.addFolder('Flick thresholds (px/s)');
flick.add(params, 'flickLight', 100, 4000);
flick.add(params, 'flickMedium', 500, 8000);
flick.add(params, 'flickFull', 1000, 15000);
gui.add(params, 'upwardBias', 0, 0.3);
const grabGui = gui.addFolder('Grab spring');
grabGui.add(params, 'grabStiffness', 5, 200);
grabGui.add(params, 'grabDamping', 1, 40);
grabGui.add(params, 'grabMaxAccel', 5, 100);
gui
  .add(params, 'solverIterations', 1, 30, 1)
  .onChange((n: number) => (world.integrationParameters.numSolverIterations = n));
gui.add(params, 'restart').name('Restart level (R)');
gui.close();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // offline support is optional
  });
}

// ---------- main loop ----------
initMusic();
loadLevel(0);
phase = 'menu';
ui.showMenu(levels, loadProgress());

let last = performance.now();
let acc = 0;
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.25);
  acc += now < slowUntil ? dt * SLOWMO_SCALE : dt;
  last = now;
  let steps = 0;
  while (acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
    stepPhysics();
    acc -= STEP;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) acc = 0; // spiral-of-death guard
  syncRender(acc / STEP);
  applyKeys(dt);
  controls.update();
  if (!physicsIdle) renderer.shadowMap.needsUpdate = true; // shadows only change while bodies move
  if (beamLeft > 0) {
    beamLeft -= dt;
    beamMat.opacity = Math.max(beamLeft, 0) / BEAM_SECONDS;
    if (beamLeft <= 0 && !spraying) beam.visible = false;
  }
  updateAimPreview(now);
  particles.update(dt, params.gravity);
  shake.update(dt);
  camera.position.add(shake.offset); // shake only the rendered frame, not the orbit state
  renderer.render(scene, camera);
  camera.position.sub(shake.offset);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test hook for smoke tests
(window as unknown as { __blox: unknown }).__blox = {
  levels,
  blocks,
  balls,
  loadLevel: (i: number) => {
    startSolo(i);
    ui.hideMenu();
  },
  phase: () => phase,
  states: blockStates,
  step: (n: number) => {
    for (let i = 0; i < n; i++) stepPhysics();
  },
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
};
