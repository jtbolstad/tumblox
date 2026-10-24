import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Level } from './level';

const INTRO_SECONDS = 2;
const MAX_ZOOM_OUT = 35; // m
const TOUCHPAD_ORBIT = 0.005; // rad per pixel of swipe
const PINCH_ZOOM = 0.01; // per unit of pinch delta

/**
 * Touchpads send swipes as smooth pixel deltas, often sideways or fractional; mouse wheels send big even
 * notches straight up or down (or count lines).
 */
function isTouchpadSwipe(ev: WheelEvent) {
  return (
    ev.deltaMode === WheelEvent.DOM_DELTA_PIXEL &&
    (ev.deltaX !== 0 || !Number.isInteger(ev.deltaY) || Math.abs(ev.deltaY) < 40)
  );
}

/**
 * The camera, its OrbitControls, the intro fly-in and the touchpad/pinch wheel handling. One instance
 * owns the camera for the whole game: title, menu and every level share it.
 */
export function createCameraRig(canvas: HTMLCanvasElement, orbitBtn: HTMLButtonElement) {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400); // far enough to keep the sky dome whole when zoomed out
  camera.position.set(0, 5, 14);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 2.5, 0);
  controls.enableDamping = true;
  controls.minDistance = 6;
  controls.maxDistance = MAX_ZOOM_OUT;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  // left button / one finger = throw; right button / two fingers = orbit + pinch
  controls.mouseButtons = { LEFT: -1 as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: -1 as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.update();

  // a one-finger-orbit mode for phones/tablets, toggled by #orbit-btn: two fingers already
  // orbit+zoom, but reaching a stack to look behind it with just one thumb is awkward otherwise
  let orbitMode = false;
  function setOrbitMode(on: boolean) {
    orbitMode = on;
    controls.touches.ONE = on ? THREE.TOUCH.ROTATE : (-1 as THREE.TOUCH);
    orbitBtn.setAttribute('aria-pressed', String(on));
  }
  orbitBtn.addEventListener('click', () => setOrbitMode(!orbitMode));

  const orbitOffset = new THREE.Vector3();
  const orbitSpherical = new THREE.Spherical();

  /** Turn the camera around the orbit target by `angle` rad and scale its distance by `zoom`. */
  function orbitCamera(angle: number, zoom = 1, tilt = 0) {
    orbitOffset.copy(camera.position).sub(controls.target);
    orbitSpherical.setFromVector3(orbitOffset);
    orbitSpherical.theta += angle;
    orbitSpherical.phi = THREE.MathUtils.clamp(orbitSpherical.phi + tilt, 0.15, controls.maxPolarAngle);
    orbitSpherical.radius = THREE.MathUtils.clamp(
      orbitSpherical.radius * zoom,
      controls.minDistance,
      controls.maxDistance,
    );
    camera.position.copy(controls.target).add(orbitOffset.setFromSpherical(orbitSpherical));
  }

  // ---------- touchpad: two-finger swipe orbits, pinch zooms; a mouse wheel still zooms ----------
  // listen on window in the capture phase, so OrbitControls' own wheel zoom never sees these events
  addEventListener(
    'wheel',
    (ev) => {
      if (ev.target !== canvas || introT < 1) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.ctrlKey) {
        orbitCamera(0, Math.exp(ev.deltaY * PINCH_ZOOM)); // a touchpad pinch arrives as ctrl + wheel
      } else if (isTouchpadSwipe(ev)) {
        orbitCamera(ev.deltaX * TOUCHPAD_ORBIT, 1, -ev.deltaY * TOUCHPAD_ORBIT);
      } else {
        orbitCamera(0, Math.exp(Math.sign(ev.deltaY) * 0.1)); // mouse wheel notch
      }
      controls.update();
    },
    { capture: true, passive: false },
  );

  /** `vary`: a level start picks a random height and distance; resetting the view (Enter) does not. */
  function frameCamera(level: Level, onTitle: boolean, vary = false) {
    let maxY = 0;
    let maxX = 0;
    for (const b of level.blocks) {
      maxY = Math.max(maxY, b.pos[1] + b.size[1] / 2);
      maxX = Math.max(maxX, Math.abs(b.pos[0]) + b.size[0] / 2);
    }
    const top = level.platform.top;
    // far enough to fit the structure's width at this aspect ratio too (wide levels, portrait phones)
    const halfWidthTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    // the title sign fills the width of the screen, centred on the letters
    const fitWidth = onTitle ? (maxX + 2) / halfWidthTan : (maxX + 1) / halfWidthTan + 2;
    // the wide title may need more room than the usual zoom limit on a portrait phone
    controls.maxDistance = Math.max(MAX_ZOOM_OUT, fitWidth + 1);
    const dist = onTitle
      ? Math.min(fitWidth, controls.maxDistance - 1)
      : Math.min(Math.max(7 + maxY * 1.1 + maxX * 1.0, 9, fitWidth), controls.maxDistance - 1);
    controls.target.set(0, top + maxY / 2, 0);
    const spread = vary && !onTitle ? Math.random() : 0.4;
    const height = top + maxY * 0.45 + 1.5 + (spread - 0.4) * (3 + maxY * 0.8); // from near ground level to a high view
    camera.position.set(
      0,
      onTitle ? top + maxY / 2 : height,
      dist * (vary && !onTitle ? 0.9 + Math.random() * 0.25 : 1), // the title is seen straight on
    );
    controls.update();
  }

  // ---------- intro fly-in ----------
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const introTo = new THREE.Vector3();
  let introT = 1; // 0..1 progress of the fly-in; 1 = not running
  let introLevel = -1; // the fly-in plays once per level, not on retry or Jenga-off rebuilds
  let introSweep = 1.4;
  let introRise = 6;
  let introPull = 0.8;

  function skipIntro() {
    if (introT >= 1) return;
    introT = 1;
    camera.position.copy(introTo);
    controls.enabled = true;
    controls.update();
  }

  /** Swoop in from high and to the side, easing out onto the framed pose. */
  function updateIntro(dt: number) {
    if (introT >= 1) return;
    introT = Math.min(introT + dt / INTRO_SECONDS, 1);
    const away = (1 - introT) ** 3;
    orbitOffset.copy(introTo).sub(controls.target);
    orbitOffset
      .applyAxisAngle(THREE.Object3D.DEFAULT_UP, away * introSweep)
      .multiplyScalar(1 + away * introPull);
    orbitOffset.y += away * introRise;
    camera.position.copy(controls.target).add(orbitOffset);
    camera.lookAt(controls.target);
    if (introT >= 1) skipIntro();
  }

  /**
   * Called once a level has finished loading and the camera is framed. Starts the fly-in for a level
   * that is new (not a retry or a Jenga-off rebuild) and returns whether it was new, so the caller
   * knows whether to show that level's banner.
   */
  function startIntro(levelIndex: number): boolean {
    if (levelIndex === introLevel) return false;
    introLevel = levelIndex;
    if (reducedMotion) return true;
    introTo.copy(camera.position);
    // a different swoop each level: either side, any sweep up to a half turn, varied height and distance
    introSweep = (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.6);
    introRise = 3 + Math.random() * 7;
    introPull = 0.4 + Math.random() * 0.8;
    introT = 0;
    controls.enabled = false;
    updateIntro(0);
    return true;
  }

  return {
    camera,
    controls,
    orbitCamera,
    frameCamera,
    startIntro,
    skipIntro,
    updateIntro,
    isOrbitMode: () => orbitMode,
    get introT() {
      return introT;
    },
    get introLevel() {
      return introLevel;
    },
    /** Picking a level from the menu flies in again; the menu's back-button restores the old value. */
    set introLevel(v: number) {
      introLevel = v;
    },
  };
}
