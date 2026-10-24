import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { BlockType } from './blocks';
import type { Level } from './level';
import { buildProps, disposeGroup, type Solid, type Spot } from './props';
import { makeEnvironment, makeIsland, setSkyColors } from './scene';
import { THEMES, type ThemeId } from './themes';

const SAIL_SPEED = 0.3; // rad/s: a lazy turn every 20 seconds or so

/** A small stable number from a string, to seed per-level randomness. */
function hashString(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Island, props, arena colliders, sky/light theme and the circus stage spotlight: everything
 *  that changes when a level switches world or goes from play to title/result lighting. */
export function createWorldTheme(deps: {
  scene: THREE.Scene;
  sky: THREE.Mesh;
  background: THREE.Color;
  fog: THREE.Fog;
  sun: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  clouds: THREE.Mesh;
  platformMat: THREE.MeshStandardMaterial;
  renderer: THREE.WebGLRenderer;
  world: RAPIER.World;
  buildCrowd: () => void;
  getLevel: () => Level;
  setTrack: (id: ThemeId, variant: number) => void;
  setAmbience: (id: ThemeId) => void;
  blockTexture: (type: BlockType, marked?: boolean) => THREE.CanvasTexture | null;
}) {
  const { scene, sky, background, fog, sun, rim, hemi, clouds, platformMat, renderer, world, buildCrowd } =
    deps;
  const { getLevel, setTrack, setAmbience, blockTexture } = deps;

  let themeId: ThemeId | null = null;
  let floatTime = 0; // worlds with a sea gently bob the island and pedestal on it
  let island: THREE.Group | null = null;
  let props: THREE.Group | null = null;
  let crowdSpots: Spot[] = [];
  let propsKey = '';
  let windmillSails: THREE.Object3D[] = []; // turn slowly, around their own z axis
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

  /** Rebuild the arena, props and crowd: different for every level, the same each time a level is replayed. */
  function applyProps(id: ThemeId, pedestalHalf: number, levelId: string) {
    const half = Math.max(3, Math.ceil(pedestalHalf));
    const key = `${id}:${half}:${levelId}`;
    if (key === propsKey) return;
    propsKey = key;
    const crowdSeed = hashString(levelId);
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
    stageSpot.target.position.set(0, title ? 3.5 : getLevel().platform.top + 2, 0);
  }

  /** Windmill sails turn slowly, around their own z axis. */
  function updateSails(dt: number) {
    for (const sail of windmillSails) sail.rotation.z += SAIL_SPEED * dt;
  }

  /** Worlds with a sea bob their island gently, as if it floats on the water. */
  function updateFloat(dt: number) {
    const sea = themeId ? THEMES[themeId].sea : undefined;
    if (sea === undefined) {
      floatTime = 0;
      if (island) island.position.y = 0;
      return;
    }
    floatTime += dt;
    if (island) island.position.y = Math.sin(floatTime * 1.8) * 0.045;
  }

  return {
    applyProps,
    applyTheme,
    applyStageLight,
    updateSails,
    updateFloat,
    getFloatOffset: () => (island ? island.position.y : 0),
    getThemeId: () => themeId,
    getCrowdSpots: () => crowdSpots,
  };
}
