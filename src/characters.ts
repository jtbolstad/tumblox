import * as THREE from 'three';
import { box, cone, cyl, merge, type Part, p } from './props';
import type { ThemeId } from './themes';

/**
 * Cube animals that live on the levels. Each is one physics box; its look is built from boxes and
 * merged into three meshes (body, head, eyes) so the head can turn and the eyes can blink.
 * Kinds are data, like blocks; moods come from `moodFor`, a pure rule.
 */
export const CHARACTER_IDS = [
  'goat',
  'hen',
  'frog',
  'parrot',
  'pig',
  'armadillo',
  'bat',
  'ghost',
  'fox',
  'owl',
  'totem',
] as const;
export type CharacterKind = (typeof CHARACTER_IDS)[number];

/** friend: must stay on the platform. rival: points for knocking it off. decor: just company. */
export const ROLES = ['friend', 'rival', 'decor'] as const;
export type Role = (typeof ROLES)[number];

/** wave and dance are crowd moves; level characters get the others from `moodFor`. */
export type Mood = 'idle' | 'alert' | 'panic' | 'tumble' | 'cheer' | 'sad' | 'wave' | 'dance';

export interface CharacterDef {
  name: string;
  /** collider box [w, h, d]; the look is built inside it, facing +z */
  size: [number, number, number];
  density: number;
  /** voice pitch multiplier */
  voice: number;
  translucent?: boolean;
  /** already wears headwear (helmet, hat), so costumes skip the hat */
  hatted?: boolean;
  /** only ever appears in this world (as spectator or in a level) */
  only?: ThemeId;
}

export const CHARACTERS: Record<CharacterKind, CharacterDef> = {
  goat: { name: 'Goat', size: [0.7, 0.9, 0.6], density: 0.7, voice: 1 },
  hen: { name: 'Hen', size: [0.6, 0.8, 0.55], density: 0.5, voice: 1.4 },
  frog: { name: 'Frog', size: [0.8, 0.6, 0.65], density: 0.6, voice: 0.8 },
  parrot: { name: 'Parrot', size: [0.55, 0.85, 0.55], density: 0.4, voice: 1.6 },
  pig: { name: 'Pig squire', size: [0.75, 0.85, 0.65], density: 0.8, voice: 0.9, hatted: true },
  armadillo: { name: 'Armadillo', size: [0.75, 0.75, 0.7], density: 0.9, voice: 0.85, hatted: true },
  bat: { name: 'Bat', size: [0.6, 0.65, 0.5], density: 0.3, voice: 1.8 },
  ghost: { name: 'Ghost', size: [0.7, 0.95, 0.6], density: 0.3, voice: 0.7, translucent: true, only: 'manor' },
  fox: { name: 'Fox', size: [0.6, 0.85, 0.6], density: 0.6, voice: 1.2 },
  owl: { name: 'Owl', size: [0.6, 0.85, 0.55], density: 0.4, voice: 0.95 },
  totem: { name: 'Tiki totem', size: [0.6, 0.95, 0.55], density: 1.1, voice: 0.6, hatted: true, only: 'tiki' },
};

/** Most different kinds of character on screen at once, level characters and crowd together. */
export const MAX_KINDS_PER_SCENE = 5;

/** The kinds a world's crowd is drawn from: no other world's exclusives, and at most 5 kinds with the level's own. */
export function crowdKinds(theme: ThemeId, natives: CharacterKind[], levelKinds: CharacterKind[]): CharacterKind[] {
  const allowed = (k: CharacterKind) => !CHARACTERS[k].only || CHARACTERS[k].only === theme;
  const kinds = new Set<CharacterKind>(levelKinds);
  for (const k of [...natives, ...CHARACTER_IDS]) {
    if (kinds.size >= MAX_KINDS_PER_SCENE) break;
    if (allowed(k)) kinds.add(k);
  }
  return [...kinds].filter(allowed);
}

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
  /** the right arm (or wing), hanging down from its shoulder pivot; the left one is its mirror image */
  arm: Part[];
  shoulder: [number, number, number];
}

/** A stubby arm with a darker hand or hoof. */
function arm(color: number, hand: number, length = 0.24, width = 0.1): Part[] {
  return [
    p(box(width, length, width), color, [0, -length / 2, 0]),
    p(box(width * 1.1, 0.05, width * 1.1), hand, [0, -length + 0.02, 0]),
  ];
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
    arm: arm(0xf2efe6, 0x8a8a8a),
    shoulder: [0.36, 0.0, 0.02],
  }),
  hen: () => ({
    body: [
      p(box(0.06, 0.14, 0.06), 0xf2a33a, [-0.1, -0.33, 0]),
      p(box(0.06, 0.14, 0.06), 0xf2a33a, [0.1, -0.33, 0]),
      p(box(0.5, 0.38, 0.48), 0xfff4dc, [0, -0.07, -0.02]),
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
    arm: [p(box(0.06, 0.24, 0.32), 0xf1e2c0, [0.03, -0.11, 0])],
    shoulder: [0.25, 0.05, -0.02],
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
    arm: arm(0x67b84a, 0x4f9a38, 0.18),
    shoulder: [0.42, -0.02, 0.12],
  }),
  parrot: () => ({
    body: [
      p(box(0.05, 0.12, 0.05), 0x5a5a5a, [-0.08, -0.37, 0]),
      p(box(0.05, 0.12, 0.05), 0x5a5a5a, [0.08, -0.37, 0]),
      p(box(0.42, 0.42, 0.4), 0xe63946, [0, -0.1, 0]),
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
    arm: [p(box(0.05, 0.32, 0.3), 0x3d7bd9, [0.025, -0.15, 0])],
    shoulder: [0.21, 0.08, -0.02],
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
    arm: arm(0xf4a6b8, 0xe88aa0, 0.22, 0.12),
    shoulder: [0.39, 0.0, 0.05],
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
    arm: arm(0xb8a890, 0x8f8170, 0.18),
    shoulder: [0.39, -0.04, 0.12],
  }),
  bat: () => ({
    body: [
      p(box(0.34, 0.36, 0.3), 0x4a3a66, [0, -0.12, 0]),
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
    arm: [
      p(box(0.05, 0.32, 0.05), 0x2f2540, [0.02, -0.16, 0]),
      p(box(0.22, 0.28, 0.02), 0x5d4a80, [0.13, -0.15, 0]),
    ],
    shoulder: [0.17, 0.02, -0.04],
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
    arm: [p(box(0.12, 0.22, 0.14), 0xf4f1ff, [0.02, -0.1, 0])],
    shoulder: [0.35, 0.0, 0.04],
  }),
  fox: () => ({
    body: [
      ...legs(0.5, 0.46, -0.425, 0.13, 0x3a2a24),
      p(box(0.5, 0.38, 0.46), 0xe8803a, [0, -0.11, -0.02]),
      p(box(0.3, 0.3, 0.04), 0xfff4e8, [0, -0.1, 0.22]),
      p(box(0.18, 0.18, 0.4), 0xe8803a, [0, -0.15, -0.38], [0.5, 0, 0]),
      p(box(0.16, 0.14, 0.12), 0xfff4e8, [0, -0.06, -0.56], [0.5, 0, 0]),
    ],
    head: [
      p(box(0.4, 0.34, 0.34), 0xe8803a, [0, 0.17, 0]),
      p(box(0.18, 0.12, 0.14), 0xfff4e8, [0, 0.08, 0.22]),
      p(box(0.05, 0.04, 0.03), INK, [0, 0.11, 0.3]),
      p(cone(0.08, 0.18, 4), 0xe8803a, [-0.13, 0.42, 0], [0, Math.PI / 4, 0]),
      p(cone(0.08, 0.18, 4), 0xe8803a, [0.13, 0.42, 0], [0, Math.PI / 4, 0]),
    ],
    eyes: eyes(0.09, 0.07),
    neck: [0, 0.08, 0.06],
    eyeAt: [0, 0.24, 0.18],
    arm: arm(0xe8803a, 0x3a2a24, 0.22),
    shoulder: [0.29, 0.02, 0.04],
  }),
  // carved tiki pole: stacked wooden blocks, a grinning face under a feather crown, plank wings
  totem: () => ({
    body: [
      p(box(0.5, 0.62, 0.46), 0x8a5a34, [0, -0.17, 0]),
      p(box(0.54, 0.1, 0.5), 0xc0504d, [0, -0.36, 0]),
      p(box(0.54, 0.08, 0.5), 0xf2b134, [0, -0.2, 0]),
      p(box(0.54, 0.1, 0.5), 0x3f9e4a, [0, -0.04, 0]),
      p(box(0.3, 0.1, 0.03), 0xe8d8b8, [0, -0.28, 0.24]),
    ],
    head: [
      p(box(0.5, 0.44, 0.46), 0xa8703f, [0, 0.22, 0]),
      p(box(0.52, 0.07, 0.42), 0x5a3a20, [0, 0.38, 0.02]),
      p(box(0.12, 0.14, 0.12), 0x7a4a28, [0, 0.16, 0.27]),
      p(box(0.28, 0.1, 0.03), 0x2a1a12, [0, 0.03, 0.24]),
      p(box(0.06, 0.06, 0.03), 0xfff4e8, [-0.08, 0.04, 0.26]),
      p(box(0.06, 0.06, 0.03), 0xfff4e8, [0.08, 0.04, 0.26]),
      p(box(0.1, 0.12, 0.1), 0xc0504d, [-0.3, 0.24, 0]),
      p(box(0.1, 0.12, 0.1), 0xc0504d, [0.3, 0.24, 0]),
      p(box(0.07, 0.3, 0.04), 0xff5d8f, [-0.12, 0.58, -0.02], [0, 0, 0.25]),
      p(box(0.07, 0.36, 0.04), 0xf2b134, [0, 0.6, -0.02]),
      p(box(0.07, 0.3, 0.04), 0x3fb7c4, [0.12, 0.58, -0.02], [0, 0, -0.25]),
    ],
    eyes: eyes(0.1, 0.1, true),
    neck: [0, 0.06, 0],
    eyeAt: [0, 0.27, 0.24],
    arm: [
      p(box(0.07, 0.3, 0.2), 0x8a5a34, [0.04, -0.15, 0]),
      p(box(0.09, 0.06, 0.22), 0xc0504d, [0.04, -0.3, 0]),
    ],
    shoulder: [0.28, 0.0, 0],
  }),
  owl: () => ({
    body: [
      p(box(0.06, 0.1, 0.08), 0xf2a33a, [-0.1, -0.38, 0.05]),
      p(box(0.06, 0.1, 0.08), 0xf2a33a, [0.1, -0.38, 0.05]),
      p(box(0.48, 0.48, 0.42), 0x8a6a4a, [0, -0.08, 0]),
      p(box(0.32, 0.34, 0.04), 0xe8d8b8, [0, -0.1, 0.21]),
    ],
    head: [
      p(box(0.46, 0.34, 0.4), 0x8a6a4a, [0, 0.17, 0]),
      p(box(0.34, 0.2, 0.02), 0xe8d8b8, [0, 0.2, 0.2]),
      p(cone(0.05, 0.12, 4), 0xf2a33a, [0, 0.11, 0.22], [Math.PI / 2, 0, 0]),
      p(box(0.08, 0.12, 0.08), 0x6e5238, [-0.17, 0.38, 0], [0, 0, 0.3]),
      p(box(0.08, 0.12, 0.08), 0x6e5238, [0.17, 0.38, 0], [0, 0, -0.3]),
    ],
    eyes: eyes(0.09, 0.1),
    neck: [0, 0.16, 0],
    eyeAt: [0, 0.22, 0.22],
    arm: [p(box(0.06, 0.34, 0.3), 0x6e5238, [0.03, -0.16, 0])],
    shoulder: [0.25, 0.1, -0.02],
  }),
};

interface Geometries {
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  arm: THREE.BufferGeometry;
  look: Look;
}

/** Bounding box of loose parts, before they are merged. */
function bounds(parts: Part[]): THREE.Box3 {
  const box3 = new THREE.Box3();
  for (const part of parts) {
    part.geo.computeBoundingBox();
    box3.union(part.geo.boundingBox as THREE.Box3);
  }
  return box3;
}

/**
 * The world's outfit, fitted to a character's head and body: `head` parts in head space (around the
 * neck pivot), `body` parts in rig space.
 */
function costume(theme: ThemeId, kind: CharacterKind, look: Look): { head: Part[]; body: Part[] } {
  const hb = bounds(look.head);
  const bb = bounds(look.body);
  const top = hb.max.y;
  const cx = (hb.min.x + hb.max.x) / 2;
  const cz = (hb.min.z + hb.max.z) / 2;
  const hw = hb.max.x - hb.min.x;
  const [, ny, nz] = look.neck;
  const front = bb.max.z;
  const back = bb.min.z;
  const bw = bb.max.x - bb.min.x;
  const hat = !CHARACTERS[kind].hatted;
  const head: Part[] = [];
  const body: Part[] = [];
  switch (theme) {
    case 'meadow':
      if (hat) {
        head.push(p(cyl(hw * 0.75, hw * 0.75, 0.04, 10), 0xe8c66a, [cx, top + 0.02, cz]));
        head.push(p(cyl(hw * 0.32, hw * 0.38, 0.14, 10), 0xe8c66a, [cx, top + 0.1, cz]));
        head.push(p(cyl(hw * 0.385, hw * 0.385, 0.04, 10), 0xe63946, [cx, top + 0.06, cz]));
      }
      break;
    case 'tiki': {
      // flower lei around the neck, a hibiscus behind one ear
      const colours = [0xff5d8f, 0xffd23f, 0xff8c42, 0xffffff];
      const r = Math.min(bw, 0.6) * 0.5;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        body.push(
          p(box(0.12, 0.12, 0.12), colours[i % 4], [
            Math.cos(a) * r,
            ny - 0.02,
            nz * 0.5 + Math.sin(a) * r * 0.8,
          ]),
        );
      }
      head.push(p(box(0.12, 0.12, 0.04), 0xff5d8f, [hb.max.x - 0.02, top - 0.08, cz]));
      head.push(p(box(0.05, 0.05, 0.05), 0xffd23f, [hb.max.x - 0.02, top - 0.08, cz + 0.03]));
      break;
    }
    case 'castle':
      if (hat) {
        head.push(p(cyl(hw * 0.3, hw * 0.3, 0.08, 8), 0xf2c230, [cx, top + 0.04, cz]));
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          head.push(
            p(cone(0.035, 0.1, 4), 0xf2c230, [
              cx + Math.cos(a) * hw * 0.27,
              top + 0.13,
              cz + Math.sin(a) * hw * 0.27,
            ]),
          );
        }
      }
      // tabard: a coloured panel down the front with a gold stripe
      body.push(p(box(bw * 0.55, 0.3, 0.03), 0x4f6db0, [0, ny - 0.22, front + 0.015]));
      body.push(p(box(0.05, 0.3, 0.035), 0xf2c230, [0, ny - 0.22, front + 0.02]));
      break;
    case 'gulch':
      if (hat) {
        head.push(p(box(hw * 1.25, 0.03, hw * 1.15), 0x7a5230, [cx, top + 0.015, cz]));
        head.push(p(box(hw * 0.6, 0.14, hw * 0.55), 0x7a5230, [cx, top + 0.1, cz]));
        head.push(p(box(hw * 0.61, 0.03, hw * 0.56), 0x3a2a24, [cx, top + 0.05, cz]));
      }
      body.push(p(box(bw * 0.5, 0.1, 0.03), 0xc0504d, [0, ny - 0.04, front + 0.015]));
      body.push(
        p(cone(bw * 0.18, 0.14, 4), 0xc0504d, [0, ny - 0.14, front + 0.02], [Math.PI, Math.PI / 4, 0]),
      );
      break;
    case 'manor':
      if (hat) {
        head.push(p(cyl(hw * 0.75, hw * 0.75, 0.03, 10), 0x2f2540, [cx, top + 0.015, cz]));
        head.push(p(cone(hw * 0.36, 0.42, 8), 0x2f2540, [cx, top + 0.22, cz], [0.2, 0, 0]));
        head.push(p(cyl(hw * 0.37, hw * 0.37, 0.05, 8), 0x8a5ac8, [cx, top + 0.06, cz]));
      }
      body.push(p(box(bw * 0.9, 0.45, 0.04), 0x3a2a5a, [0, ny - 0.25, back - 0.02], [-0.12, 0, 0]));
      break;
  }
  return { head, body };
}

const geoCache = new Map<string, Geometries>();

function geometries(kind: CharacterKind, theme?: ThemeId): Geometries {
  const key = `${kind}:${theme ?? ''}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const look = LOOKS[kind]();
  const outfit = theme ? costume(theme, kind, look) : { head: [], body: [] };
  const built = {
    body: merge([...look.body, ...outfit.body]) as THREE.BufferGeometry,
    head: merge([...look.head, ...outfit.head]) as THREE.BufferGeometry,
    eyes: merge(look.eyes) as THREE.BufferGeometry,
    arm: merge(look.arm) as THREE.BufferGeometry,
    look,
  };
  geoCache.set(key, built);
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

/** The animated look of one character. `root` follows the physics body (or stands still in the crowd). */
export class CharacterRig {
  readonly root = new THREE.Group();
  readonly headHeight: number;
  mood: Mood = 'idle';
  /** 0 sway, 1 arm pump, 2 twirl: crowds mix styles but keep one beat */
  danceStyle = 0;
  private readonly rig = new THREE.Group();
  private readonly head: THREE.Mesh;
  private readonly eyes: THREE.Mesh;
  /** shoulder pivots; the left arm mesh is mirrored, so its angles are applied mirrored too */
  private readonly armR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private time = Math.random() * 10;
  private blinkIn = 1 + Math.random() * 3;
  private blinkLeft = 0;

  /** `theme` dresses the character in that world's costume. */
  constructor(kind: CharacterKind, castShadow = true, theme?: ThemeId) {
    const g = geometries(kind, theme);
    const mat = CHARACTERS[kind].translucent ? ghostMat : solidMat;
    const body = new THREE.Mesh(g.body, mat);
    this.head = new THREE.Mesh(g.head, mat);
    this.head.position.set(...g.look.neck);
    this.eyes = new THREE.Mesh(g.eyes, eyeMat);
    this.eyes.position.set(...g.look.eyeAt);
    this.head.add(this.eyes);
    const [sx, sy, sz] = g.look.shoulder;
    this.armR.position.set(sx, sy, sz);
    this.armL.position.set(-sx, sy, sz);
    const right = new THREE.Mesh(g.arm, mat);
    const left = new THREE.Mesh(g.arm, mat);
    left.scale.x = -1;
    this.armR.add(right);
    this.armL.add(left);
    this.rig.add(body, this.head, this.armR, this.armL);
    this.root.add(this.rig);
    for (const m of [body, this.head, right, left]) m.castShadow = castShadow;
    this.headHeight = g.look.neck[1] + g.look.eyeAt[1];
  }

  /**
   * `look`: where to look, in the root's local space (null = straight ahead).
   * `beat`: the shared music position in beats; dancing and cheering lock to it, so a crowd moves together.
   */
  update(dt: number, look: THREE.Vector3 | null, beat?: number) {
    this.time += dt;
    const t = this.time;
    // b runs half a turn per beat, so sin(b) is 0 (feet down) exactly on each beat
    const b = (beat ?? t * 2) * Math.PI;
    let spin: number | null = null;
    let yaw = 0;
    let pitch = 0;
    let roll = 0;
    let hop = 0;
    let twist = 0;
    let squash = 1;
    let eyeX = 1;
    let eyeY = 1;
    // arms: raise = out to the side and up (0 hangs, ~2.6 is straight up), swing = forward (negative) or back
    let raiseR = 0.15;
    let raiseL = 0.15;
    let swingR = 0;
    let swingL = 0;
    if (look && (this.mood === 'idle' || this.mood === 'alert' || this.mood === 'wave')) {
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
        swingR = Math.sin(t * 2.2) * 0.08;
        swingL = -swingR;
        break;
      case 'alert':
        eyeX = eyeY = 1.35;
        squash = 0.93;
        raiseR = raiseL = 0.6;
        swingR = swingL = -0.4;
        break;
      case 'panic':
        yaw = Math.sin(t * 22) * 0.35;
        hop = Math.abs(Math.sin(t * 14)) * 0.06;
        eyeX = eyeY = 1.4;
        raiseR = 2.3 + Math.sin(t * 20) * 0.5;
        raiseL = 2.3 + Math.cos(t * 20) * 0.5;
        break;
      case 'tumble':
        roll = Math.sin(t * 16) * 0.5;
        eyeX = 1.3;
        eyeY = 0.35;
        raiseR = 1.5 + Math.sin(t * 16) * 0.6;
        raiseL = 1.5 - Math.sin(t * 16) * 0.6;
        break;
      case 'cheer':
        hop = Math.abs(Math.sin(b)) * 0.25;
        pitch = -0.3;
        raiseR = raiseL = 2.6 + Math.sin(b * 2) * 0.25;
        break;
      case 'sad':
        pitch = 0.45;
        eyeY = 0.55;
        squash = 0.95;
        raiseR = raiseL = 0.05;
        swingR = swingL = -0.25;
        break;
      case 'wave':
        roll = 0.12;
        raiseR = 2.5 + Math.sin(t * 9) * 0.45;
        hop = Math.max(0, Math.sin(t * 4.5)) * 0.02;
        break;
      case 'dance':
        if (this.danceStyle === 1) {
          // arm pump: hop on every beat, fists up, head nodding
          hop = Math.abs(Math.sin(b)) * 0.18;
          raiseR = raiseL = 2.4 + Math.sin(b * 2) * 0.3;
          pitch = Math.sin(b * 2) * 0.2;
        } else if (this.danceStyle === 2) {
          // twirl: one full turn every four beats, arms out
          spin = (((beat ?? t * 2) % 4) / 4) * Math.PI * 2;
          hop = Math.abs(Math.sin(b)) * 0.1;
          raiseR = raiseL = 1.4;
        } else {
          // sway: side to side over two beats, arms swapping on each beat
          twist = Math.sin(b) * 0.45;
          hop = Math.abs(Math.sin(b)) * 0.12;
          roll = Math.sin(b) * 0.25;
          raiseR = 1.3 + Math.cos(b) * 1.0;
          raiseL = 1.3 - Math.cos(b) * 1.0;
        }
        break;
    }
    // blink every few seconds
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
    const r = this.armR.rotation;
    const l = this.armL.rotation;
    r.z = damp(r.z, raiseR, 16, dt);
    l.z = damp(l.z, -raiseL, 16, dt);
    r.x = damp(r.x, swingR, 12, dt);
    l.x = damp(l.x, swingL, 12, dt);
    // a twirl follows the beat exactly; everything else eases toward its pose
    const ry = this.rig.rotation.y;
    this.rig.rotation.y = spin ?? damp(Math.atan2(Math.sin(ry), Math.cos(ry)), twist, 10, dt);
    this.rig.position.y = damp(this.rig.position.y, hop, 20, dt);
    this.rig.scale.y = damp(this.rig.scale.y, squash, 12, dt);
    this.eyes.scale.set(damp(this.eyes.scale.x, eyeX, 20, dt), damp(this.eyes.scale.y, eyeY, 25, dt), 1);
  }
}
