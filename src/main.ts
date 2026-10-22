import RAPIER from '@dimforge/rapier3d-compat';
import GUI from 'lil-gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type PointerSample, powerTier, releaseVelocity } from './throw';

const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const MAX_BALLS = 12;

const params = {
  gravity: 9.81,
  ballMass: 4,
  ballRadius: 0.35,
  // ball speed (m/s) per power tier: tap, light, medium, full
  speedTap: 6,
  speedLight: 12,
  speedMedium: 20,
  speedFull: 30,
  // flick speed (px/s) at which tiers 1..3 start
  flickLight: 300,
  flickMedium: 900,
  flickFull: 1800,
  upwardBias: 0.06,
  blockFriction: 0.7,
  blockRestitution: 0.05,
  solverIterations: 8,
  reset: () => resetTower(),
};

interface Entity {
  body: RAPIER.RigidBody;
  prevPos: THREE.Vector3;
  currPos: THREE.Vector3;
  prevRot: THREE.Quaternion;
  currRot: THREE.Quaternion;
}

interface BlockEntity extends Entity {
  instance: number; // index into the InstancedMesh
}

interface BallEntity extends Entity {
  mesh: THREE.Mesh;
}

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

world.createCollider(RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setTranslation(0, -0.5, 0).setFriction(0.9));

const blockEntities: BlockEntity[] = [];
const balls: BallEntity[] = [];
const blockColliders: RAPIER.Collider[] = [];

const TOWER_LAYERS = 5; // 5 layers x 2x2 = 20 blocks
const BLOCK_COUNT = TOWER_LAYERS * 4;
const blockMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ roughness: 0.6 }),
  BLOCK_COUNT,
);
blockMesh.castShadow = true;
blockMesh.receiveShadow = true;
blockMesh.frustumCulled = false;
scene.add(blockMesh);

function makeEntity(body: RAPIER.RigidBody): Entity {
  const t = body.translation();
  const r = body.rotation();
  const pos = new THREE.Vector3(t.x, t.y, t.z);
  const rot = new THREE.Quaternion(r.x, r.y, r.z, r.w);
  return { body, prevPos: pos.clone(), currPos: pos, prevRot: rot.clone(), currRot: rot };
}

function resetTower() {
  for (const e of blockEntities) world.removeRigidBody(e.body);
  blockEntities.length = 0;
  blockColliders.length = 0;
  for (const b of balls) removeBall(b);
  balls.length = 0;
  throwsCount = 0;
  hudThrows.textContent = '0';

  const palette = [0xe63946, 0xf4a261, 0xe9c46a, 0x2a9d8f, 0x457b9d];
  const gap = 0.002; // tiny gap avoids initial interpenetration jitter
  let i = 0;
  for (let layer = 0; layer < TOWER_LAYERS; layer++) {
    for (let k = 0; k < 4; k++) {
      const x = (k % 2 === 0 ? -0.5 : 0.5) * (1 + gap);
      const z = (k < 2 ? -0.5 : 0.5) * (1 + gap);
      const y = 0.5 + layer * (1 + gap);
      // blocks spawn asleep so the stack stands still until hit
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, y, z)
          .setSleeping(true)
          .setLinearDamping(0.05)
          .setAngularDamping(0.1),
      );
      const col = world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
          .setDensity(1)
          .setFriction(params.blockFriction)
          .setRestitution(params.blockRestitution)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
      );
      blockColliders.push(col);
      body.sleep(); // attaching the collider wakes the body, so sleep again
      const e: BlockEntity = { ...makeEntity(body), instance: i };
      blockMesh.setColorAt(i, new THREE.Color(palette[layer % palette.length]));
      blockEntities.push(e);
      i++;
    }
  }
  if (blockMesh.instanceColor) blockMesh.instanceColor.needsUpdate = true;
  syncRender(1);
}

// ---------- balls ----------
const ballGeo = new THREE.SphereGeometry(1, 24, 16);
const ballMat = new THREE.MeshStandardMaterial({ color: 0xffb703, roughness: 0.35 });

function spawnBall(origin: THREE.Vector3, velocity: THREE.Vector3) {
  const r = params.ballRadius;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(origin.x, origin.y, origin.z)
      .setLinvel(velocity.x, velocity.y, velocity.z)
      .setCcdEnabled(true), // fast balls must not tunnel through blocks
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(r).setMass(params.ballMass).setFriction(0.5).setRestitution(0.2),
    body,
  );
  const mesh = new THREE.Mesh(ballGeo, ballMat);
  mesh.scale.setScalar(r);
  mesh.castShadow = true;
  scene.add(mesh);
  balls.push({ ...makeEntity(body), mesh });
  if (balls.length > MAX_BALLS) {
    const oldest = balls.shift();
    if (oldest) removeBall(oldest);
  }
}

function removeBall(e: BallEntity) {
  world.removeRigidBody(e.body);
  scene.remove(e.mesh);
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
const unitScale = new THREE.Vector3(1, 1, 1);

function syncRender(alpha: number) {
  for (const e of blockEntities) {
    tmpPos.lerpVectors(e.prevPos, e.currPos, alpha);
    tmpRot.slerpQuaternions(e.prevRot, e.currRot, alpha);
    tmpMat.compose(tmpPos, tmpRot, unitScale);
    blockMesh.setMatrixAt(e.instance, tmpMat);
  }
  blockMesh.instanceMatrix.needsUpdate = true;
  for (const e of balls) {
    e.mesh.position.lerpVectors(e.prevPos, e.currPos, alpha);
    e.mesh.quaternion.slerpQuaternions(e.prevRot, e.currRot, alpha);
  }
}

function stepPhysics() {
  world.step();
  for (const e of blockEntities) capture(e);
  for (const e of balls) capture(e);
  // drop balls that left the world
  for (let i = balls.length - 1; i >= 0; i--) {
    if (balls[i].currPos.y < -20) {
      removeBall(balls[i]);
      balls.splice(i, 1);
    }
  }
}

// ---------- flick to throw ----------
const hudThrows = document.getElementById('throws') as HTMLElement;
const hudTier = document.getElementById('tier') as HTMLElement;
let throwsCount = 0;
const tierNames = ['tap', 'light', 'medium', 'full'];

const raycaster = new THREE.Raycaster();
let samples: PointerSample[] = [];
let throwPointer: number | null = null;
const activeTouches = new Set<number>();

canvas.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType === 'touch') {
    activeTouches.add(ev.pointerId);
    if (activeTouches.size > 1) {
      throwPointer = null; // second finger = orbit/pinch, cancel the throw
      return;
    }
  }
  if (ev.button !== 0 || throwPointer !== null) return;
  throwPointer = ev.pointerId;
  samples = [{ t: ev.timeStamp, x: ev.clientX, y: ev.clientY }];
  canvas.setPointerCapture(ev.pointerId);
});

canvas.addEventListener('pointermove', (ev) => {
  if (ev.pointerId !== throwPointer) return;
  samples.push({ t: ev.timeStamp, x: ev.clientX, y: ev.clientY });
  if (samples.length > 64) samples.shift();
});

function endPointer(ev: PointerEvent, doThrow: boolean) {
  activeTouches.delete(ev.pointerId);
  if (ev.pointerId !== throwPointer) return;
  throwPointer = null;
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
    launch(innerWidth / 2, innerHeight / 2, Infinity); // quick full-power throw
  } else if (ev.code === 'KeyR') {
    resetTower();
  }
});

const ndc = new THREE.Vector2();
const launchDir = new THREE.Vector3();
const launchOrigin = new THREE.Vector3();
const launchTarget = new THREE.Vector3();

function launch(px: number, py: number, flickSpeed: number) {
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
  spawnBall(launchOrigin, launchDir.multiplyScalar(speed));
  throwsCount++;
  hudThrows.textContent = String(throwsCount);
  hudTier.textContent = tierNames[tier];
}

// ---------- debug panel ----------
const gui = new GUI({ title: 'Debug' });
gui.add(params, 'gravity', 1, 30).onChange((g: number) => (world.gravity = { x: 0, y: -g, z: 0 }));
gui.add(params, 'ballMass', 0.5, 40);
gui.add(params, 'ballRadius', 0.15, 0.8);
const power = gui.addFolder('Power curve (m/s per tier)');
power.add(params, 'speedTap', 1, 40);
power.add(params, 'speedLight', 1, 40);
power.add(params, 'speedMedium', 1, 40);
power.add(params, 'speedFull', 1, 60);
const flick = gui.addFolder('Flick thresholds (px/s)');
flick.add(params, 'flickLight', 50, 2000);
flick.add(params, 'flickMedium', 200, 4000);
flick.add(params, 'flickFull', 500, 8000);
gui.add(params, 'upwardBias', 0, 0.3);
const mat = gui.addFolder('Blocks');
mat.add(params, 'blockFriction', 0, 1.5).onChange((v: number) => {
  for (const c of blockColliders) c.setFriction(v);
});
mat.add(params, 'blockRestitution', 0, 1).onChange((v: number) => {
  for (const c of blockColliders) c.setRestitution(v);
});
gui
  .add(params, 'solverIterations', 1, 30, 1)
  .onChange((n: number) => (world.integrationParameters.numSolverIterations = n));
gui.add(params, 'reset').name('Reset tower (R)');
if (matchMedia('(max-width: 700px)').matches) gui.close();

// ---------- main loop ----------
resetTower();

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
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test hook for smoke tests
(window as unknown as { __blox: unknown }).__blox = {
  blocks: blockEntities,
  balls,
  step: (n: number) => {
    for (let i = 0; i < n; i++) stepPhysics();
  },
  awake: () => blockEntities.filter((e) => !e.body.isSleeping()).length,
  launch,
};
