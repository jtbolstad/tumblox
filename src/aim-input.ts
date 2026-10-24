import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { playWhoosh, unlockAudio } from './audio';
import type { BlockEntity, Phase } from './entities';
import { sparkTexture } from './fx';
import { chargeTier, type PointerSample, powerTier, releaseVelocity } from './throw';
import type { createToolFx } from './tool-fx';
import { TOOLS } from './tools';

export const TAP_SPEED_THRESHOLD = 300; // px/s: below this a release counts as a held press, not a swipe
export const MIN_CHARGE_SECONDS = 0.15; // a held press shorter than this is just a tap, not a charge
/** Least time between two throws, in ms. */
const THROW_COOLDOWN = 2000;
const AIM_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const KEY_AIM_SPEED = 520; // px/s the keyboard crosshair moves
const KEY_ORBIT_SPEED = 1.2; // rad/s for Q/E
const tierNames = ['tap', 'light', 'medium', 'full'];
const tierColors = [0xffffff, 0xffe066, 0xffa94d, 0xff5c5c];
const ARC_POINTS = 40;
const ARC_DT = 0.06;

export type AimVisuals = ReturnType<typeof createAimVisuals>;

/**
 * The target ring and trajectory arc that preview a throw. Built before the grab tool (which draws
 * with the same ring and arc), so main.ts makes these first and hands them to both factories.
 */
export function createAimVisuals(scene: THREE.Scene) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.56, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthTest: false }),
  );
  ring.renderOrder = 11;
  // a dark ring around the bright one, so it reads against any background
  const ringEdge = new THREE.Mesh(
    new THREE.RingGeometry(0.56, 0.72, 40),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false }),
  );
  ringEdge.renderOrder = 10;
  ring.add(ringEdge);
  ring.visible = false;
  scene.add(ring);

  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
  // the path is a string of round dots (a one-pixel line vanishes against the scene), each with a dark halo
  const dotTexture = sparkTexture();
  const arcMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.3,
    map: dotTexture,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const arcHaloMat = new THREE.PointsMaterial({
    color: 0x000000,
    size: 0.5,
    map: dotTexture,
    transparent: true,
    opacity: 0.5,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const arcHalo = new THREE.Points(arcGeo, arcHaloMat);
  arcHalo.renderOrder = 10;
  const arcDots = new THREE.Points(arcGeo, arcMat);
  arcDots.renderOrder = 11;
  const arc = new THREE.Group();
  arc.add(arcHalo, arcDots);
  arc.frustumCulled = false;
  arcHalo.frustumCulled = arcDots.frustumCulled = false;
  arc.visible = false;
  scene.add(arc);

  return { ring, arc, arcGeo, arcMat, tierColors };
}

/**
 * Pointer, touch and keyboard throwing: the flick-to-throw and Space-to-charge input, the charge
 * tiers, the launch itself, and the aim ring + trajectory arc that preview it. What a throw *costs*
 * (throws used, party turn, stats) stays in main.ts, reached through `onLaunched`; the grab tool and
 * the laser/hose are reached through their own callbacks. main.ts still owns the aim position, the
 * spraying flag and the remote phone's hold, which this module reads and writes through the deps.
 */
export function createAimInput(deps: {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  world: RAPIER.World;
  params: {
    gravity: number;
    upwardBias: number;
    speedTap: number;
    speedLight: number;
    speedMedium: number;
    speedFull: number;
    flickLight: number;
    flickMedium: number;
    flickFull: number;
  };
  aim: { x: number; y: number; visible: boolean };
  grab: { entity: BlockEntity | null };
  beginGrab: (px: number, py: number) => boolean;
  updateGrabPreview: () => void;
  visuals: AimVisuals;
  beam: THREE.Object3D;
  beamEnd: THREE.Vector3;
  castBeam: ReturnType<typeof createToolFx>['castBeam'];
  hoseRange: number;
  cam: { readonly introT: number };
  skipIntro: () => void;
  isOrbitMode: () => boolean;
  orbitCamera: (angle: number, zoom?: number, tilt?: number) => void;
  controls: { update: () => void };
  ui: { hideBanner: () => void };
  canThrow: () => boolean;
  isGrabTool: () => boolean;
  isHoseTool: () => boolean;
  isLaserTool: () => boolean;
  isBeamTool: () => boolean;
  getPhase: () => Phase;
  getSpraying: () => boolean;
  setSpraying: (on: boolean) => void;
  getRemoteHoldStart: () => number | null;
  spawnBall: (origin: THREE.Vector3, velocity: THREE.Vector3) => void;
  fireLaser: (px: number, py: number) => void;
  onLaunched: () => void;
  closeMenu: () => void;
  restart: () => void;
  frameCamera: () => void;
}) {
  const {
    canvas,
    camera,
    world,
    params,
    aim,
    grab,
    beginGrab,
    updateGrabPreview,
    visuals,
    beam,
    beamEnd,
    castBeam,
    hoseRange,
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
    getPhase,
    getSpraying,
    setSpraying,
    getRemoteHoldStart,
    spawnBall,
    fireLaser,
    onLaunched,
    closeMenu,
    restart,
    frameCamera,
  } = deps;
  const { ring, arc, arcGeo, arcMat } = visuals;

  // ---------- flick to throw ----------
  const hudTier = document.getElementById('tier') as HTMLElement;
  const hudFlick = document.getElementById('flick') as HTMLElement;

  const raycaster = new THREE.Raycaster();
  let samples: PointerSample[] = [];
  let throwPointer: number | null = null;
  let pointerDownTime = 0; // ev.timeStamp when throwPointer went down, for press-and-hold charging
  const activeTouches = new Set<number>();
  let lastThrowAt = -Infinity;

  /** True once the throw cooldown has run out. */
  function throwCooldownDone() {
    return performance.now() - lastThrowAt >= THROW_COOLDOWN;
  }

  /** Forget the last throw, so a new level is not held up by the cooldown. */
  function forgetLastThrow() {
    lastThrowAt = -Infinity;
  }

  /** Release-or-cancel of the current pointer throw: a grab, a spray or a throw. */
  function endPointer(ev: PointerEvent, doThrow: boolean) {
    activeTouches.delete(ev.pointerId);
    if (ev.pointerId !== throwPointer) return;
    throwPointer = null;
    if (ev.pointerType !== 'mouse') aim.visible = false;
    if (getSpraying()) {
      setSpraying(false);
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
    const heldSeconds = (ev.timeStamp - pointerDownTime) / 1000;
    // barely any swipe: treat it as a held press and charge like the keyboard's Space bar
    if (flick.speed < TAP_SPEED_THRESHOLD && heldSeconds >= MIN_CHARGE_SECONDS) {
      launch(ev.clientX, ev.clientY, flickForTier(chargeTier(heldSeconds)));
    } else {
      launch(ev.clientX, ev.clientY, flick.speed);
    }
  }

  canvas.addEventListener('pointerdown', (ev) => {
    unlockAudio(); // browsers start audio only after a user gesture
    if (cam.introT < 1) {
      skipIntro(); // the first tap during the fly-in only skips it
      return;
    }
    if (ev.pointerType === 'touch') {
      activeTouches.add(ev.pointerId);
      if (isOrbitMode()) return; // one finger orbits instead of throwing; let OrbitControls handle it
      if (activeTouches.size > 1) {
        throwPointer = null; // second finger = orbit/pinch, cancel the throw
        grab.entity = null;
        setSpraying(false);
        return;
      }
    }
    if (ev.button !== 0 || throwPointer !== null || !canThrow()) return;
    aim.x = ev.clientX;
    aim.y = ev.clientY;
    if (isGrabTool() && !beginGrab(ev.clientX, ev.clientY)) return;
    if (isHoseTool()) {
      setSpraying(true);
      ui.hideBanner();
    }
    throwPointer = ev.pointerId;
    pointerDownTime = ev.timeStamp;
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

  canvas.addEventListener('pointerup', (ev) => endPointer(ev, true));
  canvas.addEventListener('pointercancel', (ev) => endPointer(ev, false));

  // ---------- keyboard: arrows aim, Space is the one-button throw / grab / spray ----------
  const keysDown = new Set<string>();
  let chargeStart: number | null = null; // performance.now() when Space went down on a throwing tool

  function flickForTier(tier: number) {
    return [0, params.flickLight, params.flickMedium, params.flickFull][tier];
  }

  function spaceDown() {
    const phase = getPhase();
    if (phase !== 'playing' && phase !== 'title') return;
    if (isGrabTool()) {
      if (grab.entity) grab.entity = null;
      else if (canThrow()) beginGrab(aim.x, aim.y);
    } else if (isHoseTool()) {
      if (canThrow()) {
        setSpraying(true);
        ui.hideBanner();
      }
    } else if (isLaserTool()) {
      launch(aim.x, aim.y, 0);
    } else if (canThrow()) {
      chargeStart = performance.now();
    }
  }

  function spaceUp() {
    if (getSpraying()) {
      setSpraying(false);
      beam.visible = false;
    }
    if (chargeStart === null) return;
    const tier = chargeTier((performance.now() - chargeStart) / 1000);
    chargeStart = null;
    launch(aim.x, aim.y, flickForTier(tier));
  }

  addEventListener('keydown', (ev) => {
    unlockAudio();
    const phase = getPhase();
    if (cam.introT < 1 && (phase === 'playing' || phase === 'title')) {
      skipIntro();
      if (ev.code === 'Space') ev.preventDefault();
      return;
    }
    if (ev.code === 'Escape' && phase === 'menu') {
      closeMenu();
    } else if (ev.code === 'Space') {
      ev.preventDefault();
      if (!ev.repeat) spaceDown();
    } else if ((ev.code === 'Enter' || ev.code === 'NumpadEnter') && phase !== 'menu' && !ev.repeat) {
      const el = document.activeElement;
      if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) return; // keep Enter for focused UI
      ev.preventDefault();
      frameCamera();
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
    setSpraying(false);
  });

  /** Move the aim crosshair and orbit/zoom the camera from held keys. */
  function applyKeys(dt: number) {
    if (keysDown.size === 0 || getPhase() === 'menu' || cam.introT < 1) return;
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
      orbitCamera(turn * KEY_ORBIT_SPEED * dt, 1 + zoom * dt);
      controls.update();
    }
  }

  // ---------- launch ----------
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
    ui.hideBanner(); // the player has got going
    if (isLaserTool()) {
      fireLaser(px, py);
    } else {
      const s = computeShot(px, py, flickSpeed);
      spawnBall(s.origin, s.velocity);
      playWhoosh(s.tier);
      hudTier.textContent = tierNames[s.tier];
    }
    lastThrowAt = performance.now();
    onLaunched();
  }

  // ---------- aim preview: target ring + trajectory arc ----------
  function updateBeamPreview() {
    arc.visible = false;
    const show = aim.visible && canThrow();
    ring.visible = show;
    if (!show) return;
    const hit = castBeam(aim.x, aim.y, isHoseTool() ? hoseRange : 80);
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
    const remoteHoldStart = getRemoteHoldStart();
    const charging = chargeStart !== null || remoteHoldStart !== null;
    const pressing = throwPointer !== null || charging;
    const show = aim.visible && canThrow();
    ring.visible = arc.visible = show;
    if (!show) return;

    // a flick overrides charging; little movement while held charges like the keyboard's Space bar
    const live = throwPointer !== null ? [...samples, { t: now, x: aim.x, y: aim.y }] : [];
    const swipeSpeed = throwPointer !== null ? releaseVelocity(live).speed : 0;
    const pointerHeld = throwPointer !== null && swipeSpeed < TAP_SPEED_THRESHOLD;
    const heldStart = chargeStart ?? remoteHoldStart ?? (pointerHeld ? pointerDownTime : null);
    const heldSeconds = heldStart !== null ? (performance.now() - heldStart) / 1000 : 0;
    const speed =
      heldStart !== null && (charging || heldSeconds >= MIN_CHARGE_SECONDS)
        ? flickForTier(chargeTier(heldSeconds))
        : pressing
          ? swipeSpeed
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

  return { launch, flickForTier, applyKeys, updateAimPreview, throwCooldownDone, forgetLastThrow };
}
