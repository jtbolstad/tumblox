import RAPIER from '@dimforge/rapier3d-compat';
import GUI from 'lil-gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BLOCKS, type BlockType } from './blocks';
import { type Level, loadBundledLevels } from './level';
import { loadProgress, recordResult } from './progress';
import {
  type BlockState,
  type BlockStatus,
  blockScore,
  finalScore,
  isSettled,
  medalFor,
  outcome,
} from './rules';
import { type PointerSample, powerTier, releaseVelocity } from './throw';
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
  restart: () => loadLevel(levelIndex),
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
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
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
sun.shadow.mapSize.set(2048, 2048);
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

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
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

world.createCollider(RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setTranslation(0, -0.5, 0).setFriction(0.9));

const blocks: BlockEntity[] = [];
const balls: BallEntity[] = [];
const colliderOwner = new Map<number, BlockEntity | BallEntity>();
const blockMeshes: THREE.InstancedMesh[] = [];
let platformCollider: RAPIER.Collider | null = null;
let platformMesh: THREE.Mesh | null = null;

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

const ui = createUi({
  onSelect: (i) => {
    loadLevel(i);
    ui.hideMenu();
  },
  onRetry: () => loadLevel(levelIndex),
  onNext: () => loadLevel(Math.min(levelIndex + 1, levels.length - 1)),
  onOpenMenu: () => {
    phase = 'menu';
    ui.showMenu(levels, loadProgress());
  },
});

function blockStates(): BlockState[] {
  return blocks.map((b) => ({ type: b.type, status: b.status }));
}

function throwsLeft() {
  return level.throws - throwsUsed;
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
  if (platformCollider) world.removeCollider(platformCollider, false);
  if (platformMesh) {
    scene.remove(platformMesh);
    platformMesh.geometry.dispose();
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
      ? RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.05).setAngularDamping(0.1)
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
    };
    blocks.push(entity);
    colliderOwner.set(collider.handle, entity);
  }

  frameCamera();
  syncRender(1);
  refreshStats();
  ui.setLevel(level);
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

const blastCenter = new THREE.Vector3();
const blastDir = new THREE.Vector3();

function detonate(source: Blaster) {
  blastCenter.copy(source.currPos);
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
    if ('type' in t && BLOCKS[t.type].behaviour === 'explode') scheduleBlast(t, CHAIN_DELAY);
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

function handleImpacts() {
  const toVanish = new Set<BlockEntity>();
  events.drainCollisionEvents((h1, h2, started) => {
    if (!started) return;
    const a = colliderOwner.get(h1);
    const b = colliderOwner.get(h2);
    const blocksHit = [a, b].filter(
      (e): e is BlockEntity => !!e && 'type' in e && !!BLOCKS[e.type].behaviour,
    );
    const bombBall = [a, b].find((e): e is BallEntity => !!e && 'tool' in e && !!TOOLS[e.tool].explodes);
    if (blocksHit.length === 0 && !bombBall) return;
    // post-solve speed of the faster body; resting contacts stay far below the thresholds
    const speed = Math.max(bodySpeed(h1), bodySpeed(h2));
    if (bombBall && speed >= BOMB_BALL_TRIGGER_SPEED) scheduleBlast(bombBall, 0);
    for (const e of blocksHit) {
      const def = BLOCKS[e.type];
      if (speed < (def.triggerSpeed ?? 0)) continue;
      if (def.behaviour === 'explode') {
        scheduleBlast(e, 0);
      } else if (def.behaviour === 'chemical') {
        // only a chemical-on-chemical touch sets it off
        if (a && b && 'type' in a && 'type' in b && a.type === 'chemical' && b.type === 'chemical') {
          scheduleBlast(e, 0);
        }
      } else if (def.behaviour === 'vanish' && simTime - e.lastHit > HIT_COOLDOWN) {
        e.lastHit = simTime;
        e.hitsLeft--;
        if (e.hitsLeft <= 0) toVanish.add(e);
      }
    }
  });
  for (const e of toVanish) removeBlock(e);
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
  ui.popup(
    `${points > 0 ? '+' : ''}${points}`,
    ((popupPos.x + 1) / 2) * innerWidth,
    ((1 - popupPos.y) / 2) * innerHeight,
    points < 0,
  );
}

function stepPhysics() {
  world.step(events);
  simTime += STEP;
  handleImpacts();

  for (let i = pendingBlasts.length - 1; i >= 0; i--) {
    if (pendingBlasts[i].at <= simTime) {
      const [due] = pendingBlasts.splice(i, 1);
      detonate(due.entity);
    }
  }

  const fallY = level.platform.top - FALL_MARGIN;
  let moving = pendingBlasts.length > 0;
  let allAsleep = true;
  for (const e of blocks) {
    if (e.status === 'removed' || !BLOCKS[e.type].mobile) continue;
    capture(e);
    if (e.status === 'alive' && e.currPos.y < fallY) {
      e.status = 'fallen';
      popupFor(e);
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
  if (phase === 'playing' && throwsUsed > 0 && isSettled(simTime - lastMotion, allAsleep && !moving)) {
    finishIfDone();
  }
}

function finishIfDone() {
  const states = blockStates();
  const result = outcome(level.goal, states, throwsLeft());
  if (result === 'playing') return;
  phase = result;
  if (result === 'won') {
    const score = finalScore(states, throwsLeft());
    const medal = medalFor(score, level.medals);
    const saved = recordResult(level.id, score, medal);
    ui.showResult({ won: true, score, medal, best: saved.best, hasNext: levelIndex < levels.length - 1 });
  } else {
    ui.showResult({ won: false, score: 0, medal: null, best: 0, hasNext: false });
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
  return phase === 'playing' && throwsLeft() > 0;
}

// last known pointer position, for the aim preview (mouse hover or active throw)
const aim = { x: 0, y: 0, visible: false };

canvas.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType === 'touch') {
    activeTouches.add(ev.pointerId);
    if (activeTouches.size > 1) {
      throwPointer = null; // second finger = orbit/pinch, cancel the throw
      return;
    }
  }
  if (ev.button !== 0 || throwPointer !== null || !canThrow()) return;
  throwPointer = ev.pointerId;
  aim.x = ev.clientX;
  aim.y = ev.clientY;
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
  if (!doThrow) return;
  samples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
  const flick = releaseVelocity(samples);
  launch(ev.clientX, ev.clientY, flick.speed);
}
canvas.addEventListener('pointerup', (ev) => endPointer(ev, true));
canvas.addEventListener('pointercancel', (ev) => endPointer(ev, false));

addEventListener('keydown', (ev) => {
  if (ev.code === 'Space') {
    ev.preventDefault();
    launch(innerWidth / 2, innerHeight / 2, Number.POSITIVE_INFINITY); // quick full-power throw
  } else if (ev.code === 'KeyR' && phase !== 'menu') {
    loadLevel(levelIndex);
  }
});

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
  if (!canThrow()) return;
  const s = computeShot(px, py, flickSpeed);
  spawnBall(s.origin, s.velocity);
  throwsUsed++;
  lastMotion = simTime;
  refreshStats();
  hudTier.textContent = tierNames[s.tier];
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

function updateAimPreview(now: number) {
  const pressing = throwPointer !== null;
  const show = aim.visible && canThrow();
  ring.visible = arc.visible = show;
  if (!show) return;

  // live flick speed includes "now", so the preview drops as the pointer slows
  const live = pressing ? [...samples, { t: now, x: aim.x, y: aim.y }] : [];
  const speed = pressing ? releaseVelocity(live).speed : 0;
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
gui
  .add(params, 'solverIterations', 1, 30, 1)
  .onChange((n: number) => (world.integrationParameters.numSolverIterations = n));
gui.add(params, 'restart').name('Restart level (R)');
gui.close();

// ---------- main loop ----------
loadLevel(0);
phase = 'menu';
ui.showMenu(levels, loadProgress());

let last = performance.now();
let acc = 0;
function frame(now: number) {
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  let steps = 0;
  while (acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
    stepPhysics();
    acc -= STEP;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) acc = 0; // spiral-of-death guard
  syncRender(acc / STEP);
  controls.update();
  updateAimPreview(now);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test hook for smoke tests
(window as unknown as { __blox: unknown }).__blox = {
  levels,
  blocks,
  balls,
  loadLevel: (i: number) => {
    loadLevel(i);
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
  aim,
};
