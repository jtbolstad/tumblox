import '@fontsource-variable/fredoka';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  type Channel,
  getVolume,
  type ImpactKind,
  isMuted,
  playBoom,
  playCrowd,
  playImpact,
  playLaser,
  playNote,
  playScore,
  playStinger,
  playVanish,
  playVoice,
  playWhoosh,
  setAmbience,
  setMuted,
  setVolume,
  unlockAudio,
  unlockOnFirstGesture,
} from './audio';
import { BLOCKS, type BlockType } from './blocks';
import { levelBrief } from './brief';
import { createCameraRig } from './camera-runtime';
import { CHARACTERS, type CharacterKind, CharacterRig, crowdKinds, type Mood, moodFor } from './characters';
import {
  type BallEntity,
  type Blaster,
  type BlockEntity,
  type CharacterEntity,
  capture,
  makeEntityBase,
  type Owner,
  type Phase,
  speedOf,
} from './entities';
import { createFireworks } from './fireworks';
import {
  Debris,
  disposeMesh,
  makeZoneMesh,
  Particles,
  Puffs,
  Shake,
  Shockwaves,
  Sparks,
  sparkTexture,
} from './fx';
import { lang, setLang, startTranslating } from './i18n';
import { type Level, loadBundledLevels } from './level';
import { blockTexture } from './marks';
import { exciteMusic, initMusic, musicBeat, setTrack } from './music';
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
import { buildProps, disposeGroup, type Solid, type Spot } from './props';
import { missFor, quipFor } from './quips';
import { drawRemoteQr, type RemoteHost, startRemoteHost } from './remote';
import {
  aimToScreen,
  type HostMsg,
  MAX_REMOTE_SLOTS,
  REMOTE_SPEED_SCALE,
  type RemoteMsg,
} from './remote-protocol';
import {
  type BlockState,
  blockScore,
  CHAIN_WINDOW,
  type CharacterState,
  chainBonus,
  characterScore,
  finalScore,
  friendLost,
  isSettled,
  medalFor,
  outcome,
  RIVAL_POINTS,
  zoneMultiplier,
} from './rules';
import {
  addLights,
  CATCH_FLOOR_Y,
  ISLAND_RADIUS,
  makeClouds,
  makeContactShadow,
  makeEnvironment,
  makeIsland,
  makeSky,
  seeded,
  setSkyColors,
} from './scene';
import { THEMES, type ThemeId } from './themes';
import { chargeTier, type PointerSample, powerTier, releaseVelocity } from './throw';
import { titleLevel } from './title';
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
const QUALITY_SETTINGS: Record<
  Quality,
  { pixelRatio: number; shadowMap: number; extras: boolean; crowd: number }
> = {
  // extras: rim light and gem sparkles
  low: { pixelRatio: 1, shadowMap: 512, extras: false, crowd: 6 },
  medium: { pixelRatio: 1.5, shadowMap: 1024, extras: true, crowd: 10 },
  high: { pixelRatio: 2, shadowMap: 2048, extras: true, crowd: 16 },
};
const SPARKLE_INTERVAL = 0.07; // s between gem glints
const DUST_SPEED = 4; // m/s impact that kicks up dust
const SQUASH_SPEED = 4; // m/s ball hit that squashes the block
const SQUASH_SECONDS = 0.18;
const TRAIL_SPEED = 6; // m/s above which balls leave a trail
const SLOWMO_PUSH = 0.18; // share of the camera distance the view pushes in during slow-mo
const GET_UP_DELAY = 1.2; // s lying still on its side before a character gets up
const GET_UP_SECONDS = 0.35; // how long the turn back upright takes, mid-hop
const GET_UP_HOP = 2.6; // m/s upward
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

// ---------- worlds ----------
let themeId: ThemeId | null = null;
let island: THREE.Group | null = null;
let props: THREE.Group | null = null;
let crowdSpots: Spot[] = [];
let propsKey = '';
let crowdSeed = 0;
let windmillSails: THREE.Object3D[] = []; // turn slowly, around their own z axis
const SAIL_SPEED = 0.3; // rad/s: a lazy turn every 20 seconds or so

/** A small stable number from a string, to seed per-level randomness. */
function hashString(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Rebuild the arena, props and crowd: different for every level, the same each time a level is replayed. */
function applyProps(id: ThemeId, pedestalHalf: number, levelId: string) {
  const half = Math.max(3, Math.ceil(pedestalHalf));
  const key = `${id}:${half}:${levelId}`;
  if (key === propsKey) return;
  propsKey = key;
  crowdSeed = hashString(levelId);
  if (props) {
    scene.remove(props);
    disposeGroup(props);
  }
  const built = buildProps(id, half, crowdSeed % 100000);
  props = built.group;
  windmillSails = built.sails;
  crowdSpots = built.spots;
  scene.add(props);
  buildArenaColliders(built.solids);
  buildCrowd();
}

const arenaColliders: RAPIER.Collider[] = [];

/** The arena blocks are solid: stray balls bounce off the stands, knocked spectators land on them. */
function buildArenaColliders(solids: Solid[]) {
  for (const c of arenaColliders) world.removeCollider(c, false);
  arenaColliders.length = 0;
  for (const s of solids) {
    arenaColliders.push(
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2)
          .setTranslation(s.pos.x, s.pos.y, s.pos.z)
          .setRotation({ x: 0, y: Math.sin(s.face / 2), z: 0, w: Math.cos(s.face / 2) })
          .setFriction(0.8)
          .setRestitution(0.3),
      ),
    );
  }
}

/** Switch sky, island, props, light and pedestal to a world. Cheap to call: does nothing if already current.
 *  `musicVariant` (0–2) selects a subtle per-level key/tempo flavour. */
function applyTheme(id: ThemeId, musicVariant = 0) {
  setTrack(id, musicVariant);
  if (id === themeId) return;
  themeId = id;
  const t = THEMES[id];
  setSkyColors(sky, t.sky);
  background.set(t.sky.horizon);
  fog.color.set(t.sky.horizon);
  if (island) {
    scene.remove(island);
    disposeGroup(island);
  }
  island = makeIsland(t);
  scene.add(island);
  scene.environment?.dispose();
  scene.environment = makeEnvironment(renderer, t);
  sun.color.set(t.sun.color);
  sun.intensity = t.sun.intensity;
  rim.color.set(t.rim);
  hemi.color.set(t.hemi.sky);
  hemi.groundColor.set(t.hemi.ground);
  hemi.intensity = t.hemi.intensity;
  (clouds.material as THREE.MeshLambertMaterial).emissive.set(t.cloud);
  platformMat.color.set(t.pedestal);
  platformMat.map = blockTexture(t.pedestalStone ? 'immobile' : 'wood', false);
  platformMat.needsUpdate = true;
  renderer.shadowMap.needsUpdate = true;
  setAmbience(id);
}

// circus look: dark surroundings, a warm spotlight on the stage (the title is darkest)
const stageSpot = new THREE.SpotLight(0xfff0d0, 0, 0, 0.62, 0.5);
stageSpot.position.set(0, 18, 15);
scene.add(stageSpot, stageSpot.target);

function applyStageLight(title: boolean) {
  const t = THEMES[themeId ?? 'meadow'];
  const dark = title ? 0.25 : t.stageDark; // how much of the world's own light is left
  const daylight = !title && dark >= 0.6; // meadow and tiki keep their own sun and rim colour
  sun.intensity = t.sun.intensity * dark;
  rim.color.set(title || daylight ? t.rim : 0xff8a6a);
  rim.intensity = title ? 0.3 : daylight ? 0.9 : 0.5;
  hemi.intensity = t.hemi.intensity * (title ? 0.35 : daylight ? 0.85 : 0.4);
  renderer.toneMappingExposure = title ? 0.9 : daylight ? 1 : 0.9;
  scene.environmentIntensity = title ? 0.3 : daylight ? 0.8 : 0.3; // the reflection probe lights blocks too
  // the sky shader ignores exposure, so dim it (and the fog it fades into) by hand
  const dim = (c: number) => new THREE.Color(c).multiplyScalar(dark).getHex();
  setSkyColors(sky, { top: dim(t.sky.top), horizon: dim(t.sky.horizon), bottom: dim(t.sky.bottom) });
  background.set(dim(t.sky.horizon));
  fog.color.set(dim(t.sky.horizon));
  stageSpot.intensity = title ? 4500 : daylight ? 2200 : 4500;
  stageSpot.target.position.set(0, title ? 3.5 : level.platform.top + 2, 0);
}

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
  rim.visible = q.extras;
  if (themeId) buildCrowd(); // crowd size follows quality
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

/**
 * Black ink outline for the title letters: a back-face copy of the block pushed out along its normals by a fixed
 * distance in metres, whatever the block's size (shares the block's instance matrices).
 */
function outlineMaterial(thickness: number) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, fog: false });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec3 blockSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      transformed += normalize(normal) * ${thickness.toFixed(3)} / blockSize;`,
    );
  };
  return mat;
}
const titleOutlineMat = outlineMaterial(0.09);
const boxGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.07); // bevelled like a wooden toy block
const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
const platformMat = new THREE.MeshStandardMaterial({
  color: 0xc8a27a,
  roughness: 0.8,
  map: blockTexture('wood', false),
});

const blockMats = new Map<BlockType, THREE.MeshStandardMaterial>();

/** Shared material per block type: painted face texture plus a finish that suits the material. */
function blockMaterial(type: BlockType) {
  const hit = blockMats.get(type);
  if (hit) return hit;
  const finish: Partial<Record<BlockType, THREE.MeshStandardMaterialParameters>> = {
    steel: { metalness: 0.25, roughness: 0.45 },
    point: { metalness: 0.55, roughness: 0.3 },
    gem: { metalness: 0.1, roughness: 0.15, emissive: BLOCKS.gem.color, emissiveIntensity: 0.18 },
    ice: { roughness: 0.12, emissive: BLOCKS.ice.color, emissiveIntensity: 0.1 },
    wood: { roughness: 0.8 },
    immobile: { roughness: 0.95 },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: BLOCKS[type].color,
    map: blockTexture(type),
    roughness: 0.6,
    ...finish[type],
  });
  blockMats.set(type, mat);
  return mat;
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
let bonus = 0; // chain-reaction points this attempt
let chainLength = 0;
let lastBlastAt = Number.NEGATIVE_INFINITY;

const ui = createUi({
  onSelect: (i, players) => {
    if (players > 1) startParty(i, players);
    else startSolo(i);
    menuReturn = null;
    ui.hideMenu();
  },
  onRetry: () => restart(),
  onNext: () => startSolo(Math.min(levelIndex + 1, levels.length - 1)),
  onOpenMenu: () => openMenu(),
  onCloseMenu: () => closeMenu(),
  onTitle: () => showTitle(),
});

let menuReturn: { phase: Phase; introLevel: number } | null = null;

function openMenu() {
  if (phase !== 'menu') menuReturn = { phase, introLevel: cam.introLevel };
  phase = 'menu';
  cam.introLevel = -1; // picking a level from the menu flies in again
  ui.showMenu(levels, loadProgress());
}

/** Close the level list without picking: back to the title, or to the level (and its result) underneath. */
function closeMenu() {
  if (phase !== 'menu') return;
  const back = menuReturn;
  menuReturn = null;
  ui.hideMenu();
  if (!back || back.phase === 'menu' || back.phase === 'title' || levelIndex === TITLE_INDEX) {
    showTitle();
    return;
  }
  phase = back.phase;
  cam.introLevel = back.introLevel;
  if (phase === 'won' || phase === 'lost') ui.restoreResult();
}

const TITLE_INDEX = -2; // levelIndex while the title scene is up (not -1, so it gets a fly-in)
const titleScene = titleLevel();

function showTitle() {
  party = null;
  loadLevel(TITLE_INDEX);
  phase = 'title';
  ui.showTitle();
}

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

function charStates(): CharacterState[] {
  return chars.map((c) => ({ role: c.role, status: c.status }));
}

/** Points so far: fallen blocks, knocked-off rivals and chain bonus. */
function currentScore() {
  return blockScore(blockStates()) + characterScore(charStates()) + bonus;
}

let lastStats = '';
function refreshStats() {
  const left = throwsLeft();
  const score = currentScore();
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
  if (levelIndex === TITLE_INDEX) showTitle();
  else if (party) startParty(levelIndex, party.players);
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
  turnBaseline = currentScore();
  ui.toast(`${playerLabel(party.current)}'s turn`);
  refreshParty();
}

/** Party: the current player's throw has resolved. Score it and pass the turn. */
function endPartyTurn() {
  if (!party) return;
  turnActive = false;
  const who = party.current;
  if (party.mode === 'duel') {
    const score = currentScore();
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
  playStinger('lose');
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
  playStinger('win');
  fireworks.celebrate(30, level.platform.top);
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
  tinted = null;
  shinyMats.length = 0;
  for (const b of balls) removeBallBody(b);
  balls.length = 0;
  for (const c of chars) {
    world.removeRigidBody(c.body);
    scene.remove(c.rig.root);
  }
  chars.length = 0;
  colliderOwner.clear();
  pendingBlasts.length = 0;
  pendingLaunches.length = 0;
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
  applyTheme(level.theme, index >= 0 ? index % 3 : 0);
  applyStageLight(index === TITLE_INDEX);
  applyProps(level.theme, Math.max(...level.platform.size) / 2, level.id);
  resetCrowd(); // back on their perches, and known to the collision lookup again (clearLevel emptied it)
  fireworks.resetFireworks();
  throwsUsed = 0;
  lastThrowAt = -Infinity;
  simTime = 0;
  lastMotion = 0;
  lastStats = '';
  collapsed = false;
  grab.entity = null;
  turnActive = false;
  spraying = false;
  bonus = 0;
  chainLength = 0;
  lastBlastAt = Number.NEGATIVE_INFINITY;
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
    if (SHINY[type] && material instanceof THREE.MeshStandardMaterial)
      shinyMats.push({ mat: material, type });
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

  for (const spec of level.characters) spawnCharacter(spec, top);
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

const charUp = new THREE.Vector3();
const getUpAxis = new THREE.Vector3();

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

/** Bodies that should start asleep: put to sleep once the new colliders are in the scene queries. */
const pendingSleep: RAPIER.RigidBody[] = [];

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
  const rig = new CharacterRig(spec.kind, true, level.theme);
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
let slowUntil = 0; // performance.now() time until which the sim runs in slow motion
const puffVel = new THREE.Vector3();
const puffPos = new THREE.Vector3();

function randomDir(out: THREE.Vector3) {
  return out.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
}

/** Flash, shockwave, smoke and chunky debris: the look of one blast. */
function blastEffects(at: THREE.Vector3, color: number) {
  const extras = QUALITY_SETTINGS[quality].extras;
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
  chainLength = simTime - lastBlastAt <= CHAIN_WINDOW ? chainLength + 1 : 1;
  lastBlastAt = simTime;
  const gained = chainBonus(chainLength);
  if (gained === 0) return;
  bonus += gained;
  exciteMusic();
  crowdCheer(2.5);
  ui.callout(`Chain ×${chainLength}!`, `+${gained}`);
  slowUntil = lastFrameAt + 1000;
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

const IMPACT_BY_TYPE: Partial<Record<BlockType, ImpactKind>> = {
  wood: 'wood',
  steel: 'metal',
  gem: 'glass',
  ice: 'glass',
};

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

// the hose's water jet: a see-through tube from the nozzle to where it lands, with droplets and splash
const jetGeo = new THREE.CylinderGeometry(0.16, 0.05, 1, 12, 1, true); // wide end (+y) at the target
const jet = new THREE.Mesh(
  jetGeo,
  new THREE.MeshBasicMaterial({
    color: 0x8fdcff,
    transparent: true,
    opacity: 0.5,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
);
jet.renderOrder = 11;
jet.frustumCulled = false;
jet.visible = false;
scene.add(jet);
const jetCore = new THREE.Mesh(
  new THREE.CylinderGeometry(0.07, 0.025, 1, 10, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.7,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
);
jetCore.renderOrder = 12;
jet.add(jetCore);
const jetUp = new THREE.Vector3(0, 1, 0);
const jetColor = new THREE.Color(0x9fe0ff);
const dropAt = new THREE.Vector3();

/** Draw the jet from the nozzle to `beamEnd`, and throw water droplets along it. */
function showJet(splash: boolean) {
  const length = nozzle.distanceTo(beamEnd);
  jet.position.copy(nozzle).add(beamEnd).multiplyScalar(0.5);
  jet.quaternion.setFromUnitVectors(jetUp, beamDir);
  jet.scale.set(1, Math.max(length, 0.01), 1);
  jet.visible = true;
  beam.visible = false;
  // droplets: spread along the stream, drifting with it and sagging under their own weight
  for (let i = 0; i < 5; i++) {
    dropAt.copy(nozzle).lerp(beamEnd, Math.random());
    sparks.emit(
      dropAt,
      beamDir.x * 6 + (Math.random() - 0.5) * 1.6,
      beamDir.y * 6 + (Math.random() - 0.5) * 1.6,
      beamDir.z * 6 + (Math.random() - 0.5) * 1.6,
      jetColor,
      0.35 + Math.random() * 0.3,
      0.5,
      false,
    );
  }
  if (splash) {
    for (let i = 0; i < 5; i++) {
      sparks.emit(
        beamEnd,
        (Math.random() - 0.5) * 5,
        1.5 + Math.random() * 4,
        (Math.random() - 0.5) * 5,
        jetColor,
        0.4 + Math.random() * 0.4,
        1.2,
        false,
      );
    }
  }
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
  if (owner && 'rig' in owner && isSpectator(owner)) {
    owner.body.applyImpulseAtPoint(beamDir.clone().multiplyScalar(LASER_IMPULSE * 2), beamEnd, true);
    bonk(owner);
    return;
  }
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
  if (pendingBlasts.length > 0 || pendingLaunches.length > 0 || grab.entity || spraying) return false;
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
  for (const c of chars) {
    capture(c);
    getUpIfFallenOver(c);
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

// ---------- flick to throw ----------
const hudTier = document.getElementById('tier') as HTMLElement;
const hudFlick = document.getElementById('flick') as HTMLElement;
const tierNames = ['tap', 'light', 'medium', 'full'];

const raycaster = new THREE.Raycaster();
let samples: PointerSample[] = [];
let throwPointer: number | null = null;
let pointerDownTime = 0; // ev.timeStamp when throwPointer went down, for press-and-hold charging
const activeTouches = new Set<number>();
const TAP_SPEED_THRESHOLD = 300; // px/s: below this a release counts as a held press, not a swipe
const MIN_CHARGE_SECONDS = 0.15; // a held press shorter than this is just a tap, not a charge

/** Least time between two throws, in ms. */
const THROW_COOLDOWN = 2000;
let lastThrowAt = -Infinity;

function canThrow() {
  // party: one action per turn; the title scene takes free throws
  return (
    (phase === 'playing' || phase === 'title') &&
    throwsLeft() > 0 &&
    !turnActive &&
    performance.now() - lastThrowAt >= THROW_COOLDOWN
  );
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
  ui.hideBanner();
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
  // intersect the pointer ray with the grip plane, whether the camera is above it (ray points down) or
  // below it (ray points up); a ray that never reaches it keeps the last target
  const reach = (grab.planeY - ray.origin.y) / ray.direction.y;
  if (Number.isFinite(reach) && reach > 0) {
    grabTarget.copy(ray.direction).multiplyScalar(Math.min(reach, 80)).add(ray.origin);
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

// ---------- phone remote: tilt aims, a swipe on the phone throws; one phone per hot-seat player ----------
const remoteBtn = document.getElementById('remote-btn') as HTMLElement;
const remotePanel = document.getElementById('remote-panel') as HTMLElement;
const remoteSlotsEl = document.getElementById('remote-slots') as HTMLElement;
let remoteHost: RemoteHost | null = null;
let lastRemoteCheck = 0;
const remoteConnected: boolean[] = Array(MAX_REMOTE_SLOTS).fill(false);
let shownRemoteSlots = 0; // how many slot panels are currently built, so we rebuild only when it changes

/** How many phones can usefully connect right now: one per hot-seat player, or just one for solo play. */
function activeSlotCount() {
  return party ? party.players : 1;
}

/** Which slot's input currently controls the game: the player at the table, or slot 0 solo. */
function activeRemoteSlot() {
  return party ? party.current : 0;
}

/** Rebuild the QR panels to match the current player count (a party starting, ending, or changing size). */
function refreshRemoteSlots() {
  if (!remoteHost) return;
  const count = activeSlotCount();
  if (count === shownRemoteSlots) return;
  shownRemoteSlots = count;
  const host = remoteHost;
  remoteSlotsEl.replaceChildren(
    ...Array.from({ length: count }, (_, slot) => {
      const box = document.createElement('div');
      box.className = 'remote-slot';
      const label = document.createElement('div');
      label.className = 'slot-label';
      label.textContent = count > 1 ? playerLabel(slot) : 'Scan with your phone';
      const canvas = document.createElement('canvas');
      canvas.width = 220;
      canvas.height = 220;
      drawRemoteQr(canvas, host.urlFor(slot));
      const status = document.createElement('div');
      status.className = 'slot-status';
      box.append(label, canvas, status);
      return box;
    }),
  );
  updateRemoteSlotStatus();
}

function updateRemoteSlotStatus() {
  const boxes = remoteSlotsEl.querySelectorAll<HTMLElement>('.remote-slot');
  boxes.forEach((box, slot) => {
    const status = box.querySelector('.slot-status');
    if (!status) return;
    status.textContent =
      remoteHost?.unreachable && !remoteConnected[slot]
        ? 'A phone cannot open localhost. Start the game with pnpm dev:phone and open the network address.'
        : remoteConnected[slot]
          ? 'Connected'
          : 'Waiting for a phone…';
  });
}

/** Buttons on the phone: the same actions as the on-screen ones. Any connected phone may use these. */
function remoteCommand(m: RemoteMsg & { t: 'cmd' | 'select' }) {
  if (m.t === 'select') {
    if (m.index >= levels.length) return;
    menuReturn = null;
    startSolo(m.index);
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
  if (!remotePanel.hidden) refreshRemoteSlots();
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
    if (m.speed < TAP_SPEED_THRESHOLD && m.holdMs / 1000 >= MIN_CHARGE_SECONDS) {
      launch(aim.x, aim.y, flickForTier(chargeTier(m.holdMs / 1000)));
    } else {
      launch(aim.x, aim.y, m.speed * REMOTE_SPEED_SCALE);
    }
  }
}

remoteBtn.addEventListener('click', (ev) => {
  ev.stopPropagation();
  remotePanel.hidden = !remotePanel.hidden;
  remoteBtn.setAttribute('aria-expanded', String(!remotePanel.hidden));
  if (remotePanel.hidden) return;
  // the connection is only opened once someone asks for the remote
  if (!remoteHost) {
    remoteHost = startRemoteHost(handleRemote, (slot, status) => {
      remoteConnected[slot] = status === 'connected';
      remoteSent = remoteLevelsSent = ''; // a reconnecting phone needs everything again
      updateRemoteSlotStatus();
    });
  }
  shownRemoteSlots = 0; // force a rebuild so the panel shows up to date QR codes and status
  refreshRemoteSlots();
});
remotePanel.addEventListener('click', (ev) => ev.stopPropagation());

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

// sound panel: one slider per channel
const soundBtn = document.getElementById('sound-btn') as HTMLElement;
const soundPanel = document.getElementById('sound-panel') as HTMLElement;
for (const input of soundPanel.querySelectorAll<HTMLInputElement>('input[type=range]')) {
  const channel = input.dataset.channel as Channel;
  input.value = String(Math.round(getVolume(channel) * 100));
  input.addEventListener('input', () => {
    unlockAudio();
    setVolume(channel, Number(input.value) / 100);
  });
}
soundBtn.addEventListener('click', (ev) => {
  ev.stopPropagation();
  soundPanel.hidden = !soundPanel.hidden;
  soundBtn.setAttribute('aria-expanded', String(!soundPanel.hidden));
  unlockAudio();
});
soundPanel.addEventListener('click', (ev) => ev.stopPropagation());
addEventListener('click', () => {
  if (!soundPanel.hidden) {
    soundPanel.hidden = true;
    soundBtn.setAttribute('aria-expanded', 'false');
  }
});

const langBtn = document.getElementById('lang-btn') as HTMLElement;
langBtn.textContent = lang === 'nb' ? 'EN' : 'NO'; // shows the language a click switches to
langBtn.addEventListener('click', () => setLang(lang === 'nb' ? 'en' : 'nb'));
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
      spraying = false;
      return;
    }
  }
  if (ev.button !== 0 || throwPointer !== null || !canThrow()) return;
  aim.x = ev.clientX;
  aim.y = ev.clientY;
  if (isGrabTool() && !beginGrab(ev.clientX, ev.clientY)) return;
  if (isHoseTool()) {
    spraying = true;
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
  const heldSeconds = (ev.timeStamp - pointerDownTime) / 1000;
  // barely any swipe: treat it as a held press and charge like the keyboard's Space bar
  if (flick.speed < TAP_SPEED_THRESHOLD && heldSeconds >= MIN_CHARGE_SECONDS) {
    launch(ev.clientX, ev.clientY, flickForTier(chargeTier(heldSeconds)));
  } else {
    launch(ev.clientX, ev.clientY, flick.speed);
  }
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
  if (phase !== 'playing' && phase !== 'title') return;
  if (isGrabTool()) {
    if (grab.entity) grab.entity = null;
    else if (canThrow()) beginGrab(aim.x, aim.y);
  } else if (isHoseTool()) {
    if (canThrow()) {
      spraying = true;
      ui.hideBanner();
    }
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
  spraying = false;
});

/** Move the aim crosshair and orbit/zoom the camera from held keys. */
function applyKeys(dt: number) {
  if (keysDown.size === 0 || phase === 'menu' || cam.introT < 1) return;
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
  throwsUsed++;
  lastThrowAt = performance.now();
  lastMotion = simTime;
  if (party) turnActive = true;
  refreshStats();
}

// ---------- aim preview: target ring + trajectory arc ----------
const tierColors = [0xffffff, 0xffe066, 0xffa94d, 0xff5c5c];
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

const ARC_POINTS = 40;
const ARC_DT = 0.06;
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

const WHITE = new THREE.Color(1, 1, 1);
const grabTint = new THREE.Color();
let tinted: BlockEntity | null = null;

/** The block being dragged glows and pulses (a Jenga tower is full of look-alikes), so you can see which one you hold. */
function updateGrabHighlight(now: number) {
  const held = grab.entity && grab.entity.status !== 'removed' ? grab.entity : null;
  if (tinted && tinted !== held && tinted.status !== 'removed') {
    tinted.mesh.setColorAt(tinted.instance, WHITE);
    if (tinted.mesh.instanceColor) tinted.mesh.instanceColor.needsUpdate = true;
  }
  tinted = held;
  if (!held) return;
  const k = 1.7 + 0.5 * Math.sin(now / 110); // above 1 = brighter than the block's own colour
  held.mesh.setColorAt(held.instance, grabTint.setRGB(k, k * 0.95, k * 0.6));
  if (held.mesh.instanceColor) held.mesh.instanceColor.needsUpdate = true;
}

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

// ---------- characters: moods, looking around, voices ----------
const CHAR_VOICE_GAP = 1200; // ms between lines from one character
const ANY_VOICE_GAP = 250; // ms between lines from anyone, so a crowd does not babble
const BALL_NOTICE_DISTANCE = 5; // m
const SHAKE_DISTANCE = 2.2; // m: moving blocks this close make a character panic
let lastAnyVoice = 0;
const lookTarget = new THREE.Vector3();
const toChar = new THREE.Vector3();
const ballVel = new THREE.Vector3();

const lastQuip = new WeakMap<CharacterEntity, number>();
const MISS_SOUNDS = ['alert', 'yelp', 'boing'] as const;
/** A ball counts as a near miss when its closest approach is between these distances (m, centre to centre). */
const MISS_MIN = 0.95;
const MISS_MAX = 2.4;

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
const HIT_VOICES = ['ouch', 'yelp', 'whoa', 'boing'] as const;
const bubblePos = new THREE.Vector3();

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
  if (physicsIdle) return false;
  for (const e of blocks) {
    if (e.status === 'removed' || e.body.isSleeping()) continue;
    if (e.currPos.distanceTo(c.currPos) < SHAKE_DISTANCE && speedOf(e.body) > 0.6) return true;
  }
  return false;
}

function updateCharacters(dt: number) {
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

// ---------- the crowd: spectators around the arena; a ball can knock them flying ----------
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
const crowd: Spectator[] = [];
const CROWD_SCALE = { arena: 2.3, ground: 1.4 }; // ground spectators stand close to the camera, so a bit smaller
const CROWD_DENSITY = 0.25; // light, so a ball sends them flying
const CROWD_HOME_DELAY = 1.5; // s at rest away from home before poofing back
let crowdCheerUntil = 0; // performance.now() until which the whole crowd cheers

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
function buildCrowd() {
  removeCrowd();
  if (!themeId) return;
  const rand = seeded((Math.random() * 2 ** 31) | 0); // a different crowd every time
  const palette = crowdKinds(
    themeId,
    THEMES[themeId].crowd,
    level.characters.map((c) => c.kind),
  );
  const natives = THEMES[themeId].crowd.filter((k) => palette.includes(k));
  const count = QUALITY_SETTINGS[quality].crowd;
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

/** Physics step for the crowd; a spectator knocked off its perch poofs back once it comes to rest. */
function stepCrowd() {
  for (const s of crowd) {
    const e = s.entity;
    const asleep = e.body.isSleeping();
    if (asleep && s.awayFor === 0 && e.currPos.distanceTo(s.home) < 0.5) continue; // at home, nothing to do
    if (!asleep) capture(e);
    const resting = asleep || speedOf(e.body) < 0.4;
    const away = e.currPos.distanceTo(s.home) > 0.5 || e.currPos.y < -5;
    s.awayFor = away && resting ? s.awayFor + STEP : 0;
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

/** A puff of smoke and sparkles where a spectator vanishes or reappears. */
function poof(at: THREE.Vector3, size: number) {
  for (let i = 0; i < 4; i++) {
    puffPos.copy(at).addScaledVector(randomDir(puffVel), 0.4 * size);
    smoke.emit(puffPos, { color: 0xffffff, size: [0.6 * size, 1.6 * size], life: 0.5, alpha: 0.8 });
  }
  particles.burst(at, 0xffe066, 8, 3);
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

const crowdLook = new THREE.Vector3();
// mostly dancing to the music, with some standing and waving in between
const IDLE_ROUTINE: Mood[] = ['idle', 'idle', 'wave', 'dance', 'dance', 'dance'];

function updateCrowd(dt: number) {
  const now = performance.now();
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

// ---------- gem glints ----------
const sparklePos = new THREE.Vector3();
let sparkleClock = 0;

/** The precious block types: they throb with light and throw off glints, in their own colours. */
const SHINY: Partial<Record<BlockType, { glint: [number, number]; glow: [number, number] }>> = {
  gem: { glint: [0xffffff, 0xbfe4ff], glow: [0.3, 0.8] },
  point: { glint: [0xfff6c9, 0xffe066], glow: [0.1, 0.45] },
};
const shinyMats: { mat: THREE.MeshStandardMaterial; type: BlockType }[] = []; // every such material in play
let gemClock = 0;

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
  if (!QUALITY_SETTINGS[quality].extras) return;
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

const trailPos = new THREE.Vector3();

/** White streak behind fast balls and glints off gems that are flying. */
function updateTrails() {
  if (!QUALITY_SETTINGS[quality].extras) return;
  for (const b of balls) {
    if (speedOf(b.body) < TRAIL_SPEED) continue;
    const r = TOOLS[b.tool].radius * params.radiusScale;
    glow.emit(b.mesh.position, { color: 0xffffff, size: [r * 1.6, r * 0.3], life: 0.25, alpha: 0.35 });
  }
  for (const g of blocks) {
    if (g.type !== 'gem' || g.status === 'removed' || g.body.isSleeping()) continue;
    if (speedOf(g.body) < 3 || Math.random() < 0.5) continue;
    trailPos.copy(g.currPos).addScaledVector(randomDir(puffVel), 0.5);
    glow.emit(trailPos, { color: 0xffffff, size: [0.3, 0.05], life: 0.4, alpha: 0.9 });
  }
}

// ---------- debug panel (development builds only) ----------
if (import.meta.env.DEV) {
  const { default: GUI } = await import('lil-gui');
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
  document.body.classList.add('dev');
}

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
  acc += now < slowUntil ? dt * SLOWMO_SCALE : dt;
  lastFrameAt = now;
  let steps = 0;
  while (acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
    stepPhysics();
    acc -= STEP;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) acc = 0; // spiral-of-death guard
  // effects slow down with the sim, so slow-mo reads as bullet time
  const fxDt = now < slowUntil ? dt * SLOWMO_SCALE : dt;
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
  updateCharacters(dt);
  updateNearMisses();
  updateCrowd(dt);
  fireworks.updateFireworks(now);
  for (const sail of windmillSails) sail.rotation.z += SAIL_SPEED * dt;
  updateTrails();
  particles.update(fxDt, params.gravity);
  sparks.update(fxDt);
  debris.update(fxDt, params.gravity);
  const pixelsPerUnit = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  smoke.update(fxDt, pixelsPerUnit);
  glow.update(fxDt, pixelsPerUnit);
  shockwaves.update(fxDt, camera);
  shake.update(dt);
  push += ((now < slowUntil ? SLOWMO_PUSH : 0) - push) * Math.min(dt * 4, 1);
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
