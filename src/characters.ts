import * as THREE from 'three';
import { box, cone, merge, type Part, p } from './props';

/**
 * Cube animals that live on the levels. Each is one physics box; its look is built from boxes and
 * merged into three meshes (body, head, eyes) so the head can turn and the eyes can blink.
 * Kinds are data, like blocks; moods come from `moodFor`, a pure rule.
 */
export const CHARACTER_IDS = ['goat', 'hen', 'frog', 'parrot', 'pig', 'armadillo', 'bat', 'ghost'] as const;
export type CharacterKind = (typeof CHARACTER_IDS)[number];

/** friend: must stay on the platform. rival: points for knocking it off. decor: just company. */
export const ROLES = ['friend', 'rival', 'decor'] as const;
export type Role = (typeof ROLES)[number];

export type Mood = 'idle' | 'alert' | 'panic' | 'tumble' | 'cheer' | 'sad';

export interface CharacterDef {
  name: string;
  /** collider box [w, h, d]; the look is built inside it, facing +z */
  size: [number, number, number];
  density: number;
  /** voice pitch multiplier */
  voice: number;
  translucent?: boolean;
}

export const CHARACTERS: Record<CharacterKind, CharacterDef> = {
  goat: { name: 'Goat', size: [0.7, 0.9, 0.6], density: 0.7, voice: 1 },
  hen: { name: 'Hen', size: [0.6, 0.8, 0.55], density: 0.5, voice: 1.4 },
  frog: { name: 'Frog', size: [0.8, 0.6, 0.65], density: 0.6, voice: 0.8 },
  parrot: { name: 'Parrot', size: [0.55, 0.85, 0.55], density: 0.4, voice: 1.6 },
  pig: { name: 'Pig squire', size: [0.75, 0.85, 0.65], density: 0.8, voice: 0.9 },
  armadillo: { name: 'Armadillo', size: [0.75, 0.75, 0.7], density: 0.9, voice: 0.85 },
  bat: { name: 'Bat', size: [0.6, 0.65, 0.5], density: 0.3, voice: 1.8 },
  ghost: { name: 'Ghost', size: [0.7, 0.95, 0.6], density: 0.3, voice: 0.7, translucent: true },
};

export interface MoodInput {
  /** set once the level is decided */
  result: 'won' | 'lost' | null;
  role: Role;
  /** m/s and rad/s of the character's body */
  speed: number;
  spin: number;
  /** a fast ball is heading this way */
  ballNear: boolean;
  /** the ground under it is moving: nearby blocks are falling */
  shaking: boolean;
}

/** What a character feels right now. Rivals are happy when the player loses, everyone else when they win. */
export function moodFor(i: MoodInput): Mood {
  if (i.result) return (i.result === 'won') === (i.role !== 'rival') ? 'cheer' : 'sad';
  if (i.speed > 2.5 || i.spin > 3) return 'tumble';
  if (i.ballNear) return 'alert';
  if (i.shaking) return 'panic';
  return 'idle';
}

// ---------- looks ----------
interface Look {
  body: Part[];
  /** head parts around the neck pivot */
  head: Part[];
  /** eye parts around the eye centre (so blinking squashes them in place) */
  eyes: Part[];
  neck: [number, number, number];
  /** eye centre relative to the neck */
  eyeAt: [number, number, number];
}

const INK = 0x1d2433;

/** Two eyes: white with a dark pupil, or just dark ovals (`pupilsOnly`). */
function eyes(spread: number, size: number, pupilsOnly = false): Part[] {
  return [-1, 1].flatMap((side) => {
    const x = side * spread;
    const pupil = p(box(size * 0.5, size * 0.65, 0.03), INK, [x, -size * 0.05, 0.025]);
    return pupilsOnly
      ? [p(box(size * 0.7, size, 0.03), INK, [x, 0, 0.01])]
      : [p(box(size, size * 1.15, 0.03), 0xffffff, [x, 0, 0]), pupil];
  });
}

function legs(w: number, d: number, y: number, h: number, color: number): Part[] {
  return [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => p(box(0.12, h, 0.12), color, [sx * (w / 2 - 0.1), y + h / 2, sz * (d / 2 - 0.1)])),
  );
}

const LOOKS: Record<CharacterKind, () => Look> = {
  goat: () => ({
    body: [...legs(0.62, 0.5, -0.45, 0.14, 0x8a8a8a), p(box(0.62, 0.36, 0.5), 0xf2efe6, [0, -0.13, -0.03])],
    head: [
      p(box(0.4, 0.38, 0.38), 0xf2efe6, [0, 0.19, 0]),
      p(box(0.24, 0.14, 0.12), 0xe8c9b8, [0, 0.1, 0.24]),
      p(box(0.08, 0.12, 0.06), 0xd8d2c4, [0, -0.02, 0.22]),
      p(cone(0.05, 0.22, 5), 0x8a8a8a, [-0.12, 0.44, -0.05], [-0.5, 0, 0.2]),
      p(cone(0.05, 0.22, 5), 0x8a8a8a, [0.12, 0.44, -0.05], [-0.5, 0, -0.2]),
      p(box(0.16, 0.06, 0.08), 0xe6e0d0, [-0.27, 0.26, 0], [0, 0, 0.4]),
      p(box(0.16, 0.06, 0.08), 0xe6e0d0, [0.27, 0.26, 0], [0, 0, -0.4]),
    ],
    eyes: eyes(0.1, 0.08),
    neck: [0, 0.05, 0.08],
    eyeAt: [0, 0.27, 0.2],
  }),
  hen: () => ({
    body: [
      p(box(0.06, 0.14, 0.06), 0xf2a33a, [-0.1, -0.33, 0]),
      p(box(0.06, 0.14, 0.06), 0xf2a33a, [0.1, -0.33, 0]),
      p(box(0.5, 0.38, 0.48), 0xfff4dc, [0, -0.07, -0.02]),
      p(box(0.06, 0.24, 0.32), 0xf1e2c0, [-0.27, -0.06, -0.02]),
      p(box(0.06, 0.24, 0.32), 0xf1e2c0, [0.27, -0.06, -0.02]),
      p(box(0.3, 0.26, 0.1), 0xf1e2c0, [0, 0.08, -0.27], [-0.4, 0, 0]),
    ],
    head: [
      p(box(0.32, 0.32, 0.3), 0xfff4dc, [0, 0.16, 0]),
      p(box(0.06, 0.1, 0.18), 0xe63946, [0, 0.36, 0]),
      p(cone(0.06, 0.14, 4), 0xf2a33a, [0, 0.12, 0.2], [Math.PI / 2, 0, 0]),
      p(box(0.05, 0.08, 0.04), 0xe63946, [0, 0.03, 0.16]),
    ],
    eyes: eyes(0.08, 0.07),
    neck: [0, 0.12, 0.08],
    eyeAt: [0, 0.2, 0.16],
  }),
  frog: () => ({
    body: [
      ...legs(0.76, 0.6, -0.3, 0.08, 0x4f9a38),
      p(box(0.76, 0.26, 0.6), 0x67b84a, [0, -0.09, 0]),
      p(box(0.5, 0.04, 0.4), 0xd8eac0, [0, -0.22, 0.05]),
    ],
    head: [
      p(box(0.66, 0.2, 0.42), 0x67b84a, [0, 0.1, 0.06]),
      p(box(0.42, 0.03, 0.02), INK, [0, 0.05, 0.28]),
      p(box(0.16, 0.12, 0.16), 0x67b84a, [-0.2, 0.24, 0.12]),
      p(box(0.16, 0.12, 0.16), 0x67b84a, [0.2, 0.24, 0.12]),
    ],
    eyes: eyes(0.2, 0.09),
    neck: [0, 0.03, 0],
    eyeAt: [0, 0.26, 0.21],
  }),
  parrot: () => ({
    body: [
      p(box(0.05, 0.12, 0.05), 0x5a5a5a, [-0.08, -0.37, 0]),
      p(box(0.05, 0.12, 0.05), 0x5a5a5a, [0.08, -0.37, 0]),
      p(box(0.42, 0.42, 0.4), 0xe63946, [0, -0.1, 0]),
      p(box(0.05, 0.32, 0.3), 0x3d7bd9, [-0.23, -0.08, -0.02]),
      p(box(0.05, 0.32, 0.3), 0x3d7bd9, [0.23, -0.08, -0.02]),
      p(box(0.14, 0.36, 0.06), 0xffc400, [0, -0.25, -0.24], [0.5, 0, 0]),
    ],
    head: [
      p(box(0.34, 0.32, 0.32), 0xe63946, [0, 0.16, 0]),
      p(box(0.12, 0.14, 0.12), 0xffc400, [0, 0.12, 0.2]),
      p(box(0.08, 0.06, 0.06), INK, [0, 0.04, 0.24]),
      p(box(0.1, 0.1, 0.02), 0xffffff, [-0.12, 0.14, 0.16]),
      p(box(0.1, 0.1, 0.02), 0xffffff, [0.12, 0.14, 0.16]),
    ],
    eyes: eyes(0.09, 0.06),
    neck: [0, 0.11, 0.04],
    eyeAt: [0, 0.23, 0.17],
  }),
  pig: () => ({
    body: [...legs(0.66, 0.54, -0.43, 0.12, 0xe88aa0), p(box(0.66, 0.38, 0.56), 0xf4a6b8, [0, -0.12, -0.02])],
    head: [
      p(box(0.44, 0.4, 0.38), 0xf4a6b8, [0, 0.2, 0]),
      p(box(0.2, 0.14, 0.08), 0xe88aa0, [0, 0.13, 0.22]),
      p(box(0.04, 0.05, 0.02), 0x8a4a5a, [-0.05, 0.13, 0.265]),
      p(box(0.04, 0.05, 0.02), 0x8a4a5a, [0.05, 0.13, 0.265]),
      // squire helmet with a crest
      p(box(0.48, 0.12, 0.42), 0xb9b4a8, [0, 0.43, 0]),
      p(box(0.06, 0.12, 0.3), 0x4f6db0, [0, 0.53, 0]),
      p(cone(0.07, 0.14, 4), 0xe88aa0, [-0.19, 0.38, 0.05], [0, 0, 0.5]),
      p(cone(0.07, 0.14, 4), 0xe88aa0, [0.19, 0.38, 0.05], [0, 0, -0.5]),
    ],
    eyes: eyes(0.1, 0.07),
    neck: [0, 0.05, 0.1],
    eyeAt: [0, 0.27, 0.2],
  }),
  armadillo: () => ({
    body: [
      ...legs(0.6, 0.56, -0.375, 0.1, 0x8f8170),
      ...[-0.18, 0, 0.18].map((z, i) =>
        p(box(0.68, 0.36, 0.18), i % 2 ? 0x8f8170 : 0xa89a86, [0, -0.1 + (i === 1 ? 0.03 : 0), z - 0.04]),
      ),
      p(box(0.1, 0.08, 0.2), 0x8f8170, [0, -0.2, -0.32]),
    ],
    head: [
      p(box(0.3, 0.26, 0.28), 0xb8a890, [0, 0.13, 0]),
      p(box(0.12, 0.1, 0.18), 0xb8a890, [0, 0.07, 0.2]),
      p(box(0.03, 0.03, 0.02), INK, [0, 0.09, 0.3]),
      // cowboy hat
      p(box(0.5, 0.03, 0.44), 0x7a5230, [0, 0.28, 0]),
      p(box(0.28, 0.14, 0.24), 0x7a5230, [0, 0.36, 0]),
      p(box(0.29, 0.03, 0.25), 0xc0504d, [0, 0.31, 0]),
    ],
    eyes: eyes(0.08, 0.06),
    neck: [0, 0.03, 0.22],
    eyeAt: [0, 0.18, 0.15],
  }),
  bat: () => ({
    body: [
      p(box(0.34, 0.36, 0.3), 0x4a3a66, [0, -0.12, 0]),
      p(box(0.3, 0.26, 0.03), 0x5d4a80, [-0.3, -0.06, -0.05], [0, 0.3, 0.3]),
      p(box(0.3, 0.26, 0.03), 0x5d4a80, [0.3, -0.06, -0.05], [0, -0.3, -0.3]),
      p(box(0.05, 0.1, 0.05), 0x2f2540, [-0.08, -0.33, 0]),
      p(box(0.05, 0.1, 0.05), 0x2f2540, [0.08, -0.33, 0]),
    ],
    head: [
      p(box(0.32, 0.28, 0.28), 0x4a3a66, [0, 0.14, 0]),
      p(cone(0.06, 0.16, 4), 0x4a3a66, [-0.11, 0.34, 0], [0, 0, 0.2]),
      p(cone(0.06, 0.16, 4), 0x4a3a66, [0.11, 0.34, 0], [0, 0, -0.2]),
      p(box(0.03, 0.05, 0.02), 0xffffff, [-0.05, 0.03, 0.15]),
      p(box(0.03, 0.05, 0.02), 0xffffff, [0.05, 0.03, 0.15]),
    ],
    eyes: eyes(0.08, 0.07),
    neck: [0, 0.06, 0.02],
    eyeAt: [0, 0.18, 0.15],
  }),
  ghost: () => ({
    body: [
      p(box(0.66, 0.5, 0.56), 0xf4f1ff, [0, -0.16, 0]),
      ...[-0.24, -0.08, 0.08, 0.24].map((x, i) =>
        p(box(0.14, 0.1, 0.5), 0xf4f1ff, [x, -0.44 - (i % 2) * 0.03, 0]),
      ),
    ],
    head: [p(box(0.6, 0.4, 0.52), 0xf4f1ff, [0, 0.2, 0])],
    eyes: eyes(0.12, 0.12, true),
    neck: [0, 0.07, 0],
    eyeAt: [0, 0.28, 0.27],
  }),
};

interface Geometries {
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  look: Look;
}

const geoCache = new Map<CharacterKind, Geometries>();

function geometries(kind: CharacterKind): Geometries {
  const hit = geoCache.get(kind);
  if (hit) return hit;
  const look = LOOKS[kind]();
  const built = {
    body: merge(look.body) as THREE.BufferGeometry,
    head: merge(look.head) as THREE.BufferGeometry,
    eyes: merge(look.eyes) as THREE.BufferGeometry,
    look,
  };
  geoCache.set(kind, built);
  return built;
}

const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 });
const ghostMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.6,
  transparent: true,
  opacity: 0.82,
  emissive: 0x6a5aa0,
  emissiveIntensity: 0.35,
});
const eyeMat = new THREE.MeshBasicMaterial({ vertexColors: true });

const damp = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * Math.min(dt * rate, 1);

/** The animated look of one character. `root` follows the physics body; the rest is procedural. */
export class CharacterRig {
  readonly root = new THREE.Group();
  readonly headHeight: number;
  mood: Mood = 'idle';
  private readonly rig = new THREE.Group();
  private readonly head: THREE.Mesh;
  private readonly eyes: THREE.Mesh;
  private time = Math.random() * 10;
  private blinkIn = 1 + Math.random() * 3;
  private blinkLeft = 0;

  constructor(kind: CharacterKind) {
    const g = geometries(kind);
    const mat = CHARACTERS[kind].translucent ? ghostMat : solidMat;
    const body = new THREE.Mesh(g.body, mat);
    this.head = new THREE.Mesh(g.head, mat);
    this.head.position.set(...g.look.neck);
    this.eyes = new THREE.Mesh(g.eyes, eyeMat);
    this.eyes.position.set(...g.look.eyeAt);
    this.head.add(this.eyes);
    this.rig.add(body, this.head);
    this.root.add(this.rig);
    for (const m of [body, this.head]) m.castShadow = true;
    this.headHeight = g.look.neck[1] + g.look.eyeAt[1];
  }

  /** `look`: where to look, in the root's local space (null = straight ahead). */
  update(dt: number, look: THREE.Vector3 | null) {
    this.time += dt;
    const t = this.time;
    let yaw = 0;
    let pitch = 0;
    let roll = 0;
    let hop = 0;
    let squash = 1;
    let eyeX = 1;
    let eyeY = 1;
    if (look && (this.mood === 'idle' || this.mood === 'alert')) {
      yaw = THREE.MathUtils.clamp(Math.atan2(look.x, look.z), -0.8, 0.8);
      pitch = THREE.MathUtils.clamp(
        -Math.atan2(look.y - this.headHeight, Math.hypot(look.x, look.z)),
        -0.5,
        0.5,
      );
    }
    switch (this.mood) {
      case 'idle':
        hop = Math.max(0, Math.sin(t * 2.2)) * 0.012;
        break;
      case 'alert':
        eyeX = eyeY = 1.35;
        squash = 0.93;
        break;
      case 'panic':
        yaw = Math.sin(t * 22) * 0.35;
        hop = Math.abs(Math.sin(t * 14)) * 0.06;
        eyeX = eyeY = 1.4;
        break;
      case 'tumble':
        roll = Math.sin(t * 16) * 0.5;
        eyeX = 1.3;
        eyeY = 0.35;
        break;
      case 'cheer':
        hop = Math.abs(Math.sin(t * 7)) * 0.25;
        pitch = -0.3;
        break;
      case 'sad':
        pitch = 0.45;
        eyeY = 0.55;
        squash = 0.95;
        break;
    }
    // blink every few seconds, except mid-tumble when the eyes are squeezed shut anyway
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkLeft = 0.12;
      this.blinkIn = 2 + Math.random() * 3;
    }
    if (this.blinkLeft > 0) {
      this.blinkLeft -= dt;
      eyeY = 0.1;
    }
    const h = this.head.rotation;
    h.y = damp(h.y, yaw, 10, dt);
    h.x = damp(h.x, pitch, 10, dt);
    h.z = damp(h.z, roll, 12, dt);
    this.rig.position.y = damp(this.rig.position.y, hop, 20, dt);
    this.rig.scale.y = damp(this.rig.scale.y, squash, 12, dt);
    this.eyes.scale.set(damp(this.eyes.scale.x, eyeX, 20, dt), damp(this.eyes.scale.y, eyeY, 25, dt), 1);
  }
}
