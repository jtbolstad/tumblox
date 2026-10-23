import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seeded } from './scene';
import { THEMES, type ThemeId } from './themes';

/**
 * Decoration for each world, built in code from primitives: props on the island, scenery far away.
 * Decoration only: no colliders. Everything is merged into one lit mesh plus one glowing mesh
 * (flames, the moon), so a world costs two draw calls.
 */

export interface Part {
  geo: THREE.BufferGeometry;
  glow?: boolean;
}

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

/** A primitive painted one colour, moved into place. Keeps only position, normal and colour so all parts merge. */
export function p(
  geo: THREE.BufferGeometry,
  color: number,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  glow = false,
): Part {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  tmpMatrix.compose(
    new THREE.Vector3(...pos),
    tmpQuat.setFromEuler(tmpEuler.set(...rot)),
    new THREE.Vector3(1, 1, 1),
  );
  g.applyMatrix4(tmpMatrix);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  tmpColor.set(color);
  for (let i = 0; i < count; i++) colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return { geo: g, glow };
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const ball = (r: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail);
export const cone = (r: number, h: number, seg = 7) => new THREE.ConeGeometry(r, h, seg);

// ---------- props, built around their own origin on the ground ----------
type Builder = (rand: () => number) => Part[];

const tree: Builder = (rand) => {
  const h = 1.6 + rand();
  return [
    p(cyl(0.18, 0.25, h), 0x8a5a3b, [0, h / 2, 0]),
    p(ball(1.1 + rand() * 0.4), rand() < 0.5 ? 0x4f9e4f : 0x5fb35a, [0, h + 0.7, 0]),
    p(ball(0.7), 0x6cc06a, [0.5, h + 1.2, 0.2]),
  ];
};
const flowers: Builder = (rand) =>
  [0xff6b9a, 0xffd23f, 0xffffff, 0xb07cff].map((c, i) =>
    p(ball(0.16), c, [Math.cos(i * 1.7) * 0.5, 0.18, Math.sin(i * 1.7) * 0.5 + rand() * 0.2]),
  );
const fence: Builder = () => [
  p(box(0.15, 0.8, 0.15), 0xe8dcc0, [-1, 0.4, 0]),
  p(box(0.15, 0.8, 0.15), 0xe8dcc0, [1, 0.4, 0]),
  p(box(2.3, 0.12, 0.08), 0xe8dcc0, [0, 0.55, 0]),
  p(box(2.3, 0.12, 0.08), 0xe8dcc0, [0, 0.3, 0]),
];
const windmill: Builder = () => [
  p(cyl(0.9, 1.4, 5, 8), 0xf2e8d5, [0, 2.5, 0]),
  p(cone(1.2, 1.4, 8), 0xc0504d, [0, 5.7, 0]),
  p(box(0.25, 5, 0.6), 0xd8c8a8, [0, 5, 1.1], [0, 0, 0.5]),
  p(box(0.25, 5, 0.6), 0xd8c8a8, [0, 5, 1.1], [0, 0, 2.07]),
];
const palm: Builder = (rand) => {
  const parts: Part[] = [];
  const lean = 0.25 + rand() * 0.2;
  let x = 0;
  let y = 0;
  for (let i = 0; i < 5; i++) {
    parts.push(p(cyl(0.16, 0.2, 0.9), i % 2 ? 0x9c7b4f : 0xae8b5c, [x, y + 0.45, 0], [0, 0, -lean]));
    x += Math.sin(lean) * 0.9;
    y += Math.cos(lean) * 0.9;
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    parts.push(
      p(box(1.8, 0.06, 0.45), 0x3f9e4a, [x + Math.cos(a) * 0.8, y - 0.15, Math.sin(a) * 0.8], [0, -a, -0.35]),
    );
  }
  return parts;
};
const torch: Builder = () => [
  p(cyl(0.08, 0.1, 1.8), 0x7a5230, [0, 0.9, 0]),
  p(cyl(0.22, 0.12, 0.3), 0x5a3a20, [0, 1.85, 0]),
  p(cone(0.18, 0.5, 6), 0xffa733, [0, 2.2, 0], [0, 0, 0], true),
];
const totem: Builder = () =>
  [0xc0504d, 0x3f9e4a, 0xf2b134, 0x4f86c6].map((c, i) => p(box(0.8, 0.75, 0.8), c, [0, 0.38 + i * 0.75, 0]));
const hut: Builder = () => [
  p(cyl(1.4, 1.5, 1.6, 8), 0xd9b77a, [0, 0.8, 0]),
  p(cone(2.1, 1.6, 8), 0xb08850, [0, 2.4, 0]),
  p(box(0.6, 1, 0.1), 0x5a3a20, [0, 0.5, 1.45]),
];
const tower: Builder = () => [
  p(cyl(1.3, 1.4, 6, 8), 0xb9b4a8, [0, 3, 0]),
  p(cone(1.7, 2.2, 8), 0x4f6db0, [0, 7.1, 0]),
  p(box(0.3, 0.6, 0.1), 0x3a3540, [0, 4.5, 1.3]),
];
const banner: Builder = (rand) => [
  p(cyl(0.06, 0.06, 3.2), 0x7a5230, [0, 1.6, 0]),
  p(box(0.9, 1.2, 0.05), rand() < 0.5 ? 0xc0504d : 0x4f6db0, [0.5, 2.5, 0]),
];
const hay: Builder = () => [p(cyl(0.6, 0.6, 1.1, 10), 0xe6c35c, [0, 0.6, 0], [0, 0, Math.PI / 2])];
const wall: Builder = () => [
  p(box(3, 1.4, 0.7), 0xa7a39a, [0, 0.7, 0]),
  p(box(0.6, 0.4, 0.7), 0xa7a39a, [-1.1, 1.6, 0]),
  p(box(0.6, 0.4, 0.7), 0xa7a39a, [0, 1.6, 0]),
  p(box(0.6, 0.4, 0.7), 0xa7a39a, [1.1, 1.6, 0]),
];
const cactus: Builder = (rand) => {
  const h = 1.8 + rand() * 1.2;
  return [
    p(cyl(0.3, 0.32, h), 0x5f9e4f, [0, h / 2, 0]),
    p(cyl(0.18, 0.18, 0.8), 0x5f9e4f, [0.5, h * 0.55, 0]),
    p(cyl(0.18, 0.18, 0.5), 0x5f9e4f, [0.25, h * 0.45, 0], [0, 0, Math.PI / 2]),
    p(cyl(0.16, 0.16, 0.6), 0x5f9e4f, [-0.45, h * 0.7, 0]),
    p(cyl(0.16, 0.16, 0.4), 0x5f9e4f, [-0.25, h * 0.6, 0], [0, 0, Math.PI / 2]),
  ];
};
const barrel: Builder = () => [
  p(cyl(0.45, 0.45, 1.1, 10), 0x9a6237, [0, 0.55, 0]),
  p(cyl(0.47, 0.47, 0.08, 10), 0x4a4a4a, [0, 0.25, 0]),
  p(cyl(0.47, 0.47, 0.08, 10), 0x4a4a4a, [0, 0.85, 0]),
];
const waterTower: Builder = () => [
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => p(box(0.2, 4, 0.2), 0x7a5230, [sx, 2, sz]))),
  p(cyl(1.6, 1.6, 2.2, 10), 0x9a6237, [0, 5.1, 0]),
  p(cone(1.8, 0.9, 10), 0x6e4a2c, [0, 6.65, 0]),
];
const skull: Builder = () => [
  p(box(0.7, 0.45, 0.55), 0xf2ead8, [0, 0.25, 0]),
  p(cyl(0.06, 0.1, 0.9), 0xf2ead8, [0.6, 0.45, 0], [0, 0, -1]),
  p(cyl(0.06, 0.1, 0.9), 0xf2ead8, [-0.6, 0.45, 0], [0, 0, 1]),
];
const rock: Builder = (rand) => [p(ball(0.6 + rand() * 0.6), 0xc27a52, [0, 0.3, 0])];
const tombstone: Builder = (rand) => [
  p(box(0.8, 1, 0.25), 0x8a8794, [0, 0.5, 0], [0, 0, (rand() - 0.5) * 0.3]),
  p(cyl(0.4, 0.4, 0.25, 10), 0x8a8794, [0, 1, 0], [Math.PI / 2, 0, 0]),
];
const pumpkin: Builder = () => [
  p(ball(0.5, 1), 0xf28a1e, [0, 0.4, 0]),
  p(cyl(0.05, 0.07, 0.25), 0x3f7a3a, [0, 0.9, 0]),
];
const deadTree: Builder = (rand) => {
  const h = 2.5 + rand();
  return [
    p(cyl(0.12, 0.25, h), 0x4a3f4f, [0, h / 2, 0]),
    p(cyl(0.06, 0.1, 1.4), 0x4a3f4f, [0.45, h * 0.7, 0], [0, 0, -0.9]),
    p(cyl(0.05, 0.09, 1.1), 0x4a3f4f, [-0.4, h * 0.85, 0.1], [0.2, 0, 1]),
  ];
};
const ironFence: Builder = () =>
  Array.from({ length: 7 }, (_, i) => p(cyl(0.04, 0.04, 1.2, 5), 0x2f2a36, [-1.2 + i * 0.4, 0.6, 0])).concat(
    p(box(2.6, 0.08, 0.08), 0x2f2a36, [0, 1, 0]),
  );

/** Props around the island: [builder, count]; the first entries are big and go at the back. */
const PROP_SETS: Record<ThemeId, { back: [Builder, number][]; ring: [Builder, number][] }> = {
  meadow: {
    back: [[windmill, 1]],
    ring: [
      [tree, 7],
      [flowers, 8],
      [fence, 4],
    ],
  },
  tiki: {
    back: [[hut, 2]],
    ring: [
      [palm, 8],
      [torch, 5],
      [totem, 2],
    ],
  },
  castle: {
    back: [[tower, 2]],
    ring: [
      [banner, 4],
      [hay, 4],
      [wall, 3],
      [tree, 3],
    ],
  },
  gulch: {
    back: [[waterTower, 1]],
    ring: [
      [cactus, 8],
      [barrel, 4],
      [skull, 2],
      [rock, 5],
    ],
  },
  manor: {
    back: [[deadTree, 2]],
    ring: [
      [tombstone, 9],
      [pumpkin, 6],
      [deadTree, 3],
      [ironFence, 3],
    ],
  },
};

/** Island props keep out of this radius (pedestal, zones, where blocks usually land)... */
const CLEAR_RADIUS = 9.8;
/** ...and inside the arena's inner tier. */
const PROP_OUTER_RADIUS = 13.4;
/** ...and out of the sector in front of the default camera (+z), so they never block the view. */
const FRONT_HALF_ANGLE = THREE.MathUtils.degToRad(70);
const BACK_HALF_ANGLE = THREE.MathUtils.degToRad(14);

function placeAll(
  parts: Part[],
  built: Part[],
  x: number,
  y: number,
  z: number,
  rotY: number,
  scale: number,
) {
  tmpMatrix.compose(
    new THREE.Vector3(x, y, z),
    tmpQuat.setFromEuler(tmpEuler.set(0, rotY, 0)),
    new THREE.Vector3(scale, scale, scale),
  );
  for (const part of built) {
    part.geo.applyMatrix4(tmpMatrix);
    parts.push(part);
  }
}

/** A place for a spectator to stand, facing the play area. */
export interface Spot {
  pos: THREE.Vector3;
  /** rotation around y that faces the centre */
  face: number;
  /** on the grass (true) or on top of an arena block */
  ground: boolean;
}

/** The arena opens toward the default camera (+z) so it never blocks the view. */
const ARENA_OPEN_HALF = THREE.MathUtils.degToRad(62);
const TIERS = [
  { r: 15.5, h: [2.2, 3.4], w: [3.4, 4.6], d: 3.2 },
  { r: 19.6, h: [4.6, 7.4], w: [4, 5.6], d: 3.4 },
] as const;

const lerp = (range: readonly [number, number], t: number) => range[0] + (range[1] - range[0]) * t;
const faceCentre = (x: number, z: number) => Math.atan2(-x, -z);

/** Darker at the foot, lighter at the top, so the giant blocks read as soft painted shapes. */
function shadeByHeight(part: Part, height: number) {
  const pos = part.geo.getAttribute('position');
  const col = part.geo.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.78 + 0.3 * THREE.MathUtils.clamp(pos.getY(i) / height, 0, 1);
    col.setXYZ(i, Math.min(col.getX(i) * k, 1), Math.min(col.getY(i) * k, 1), Math.min(col.getZ(i) * k, 1));
  }
}

/** Two tiers of giant pastel blocks ringing the play area like stadium seating; returns their tops. */
function arena(theme: ThemeId, rand: () => number): { parts: Part[]; tops: (Spot & { tier: number })[] } {
  const palette = THEMES[theme].arena;
  const parts: Part[] = [];
  const tops: (Spot & { tier: number })[] = [];
  TIERS.forEach((tier, t) => {
    const end = Math.PI / 2 + 2 * Math.PI - ARENA_OPEN_HALF;
    let a = Math.PI / 2 + ARENA_OPEN_HALF + (t === 1 ? 0.12 : 0);
    for (;;) {
      const w = lerp(tier.w, rand());
      const h = lerp(tier.h, rand());
      const mid = a + w / 2 / tier.r;
      if (a + w / tier.r > end) break;
      const x = Math.cos(mid) * tier.r;
      const z = Math.sin(mid) * tier.r;
      const face = faceCentre(x, z);
      const part = p(
        new RoundedBoxGeometry(w, h, tier.d, 2, 0.35),
        palette[Math.floor(rand() * palette.length)],
        [x, h / 2 - 0.05, z],
        [0, face, 0],
      );
      shadeByHeight(part, h);
      parts.push(part);
      tops.push({ pos: new THREE.Vector3(x, h - 0.05, z), face, ground: false, tier: t });
      a += (w + 0.3) / tier.r;
    }
  });
  return { parts, tops };
}

function islandProps(
  theme: ThemeId,
  rand: () => number,
  tops: (Spot & { tier: number })[],
  pedestalHalf: number,
): { parts: Part[]; free: Spot[] } {
  // a wide pedestal (the title) pushes loose props and ground spectators further out
  const clear = Math.max(CLEAR_RADIUS, pedestalHalf + 1.5);
  const parts: Part[] = [];
  const taken: [number, number][] = [];
  const free = (x: number, z: number, gap: number) =>
    taken.every(([tx, tz]) => Math.hypot(x - tx, z - tz) > gap);
  const { back, ring } = PROP_SETS[theme];
  const spots = [...tops];
  for (const [build, count] of back) {
    for (let i = 0; i < count; i++) {
      // big pieces stand on top of the back tier, to the sides of the target
      const side = count === 1 ? 1 : i % 2 === 0 ? -1 : 1;
      const want = -Math.PI / 2 + side * (0.6 + rand() * 0.3);
      let best = -1;
      let bestGap = Number.POSITIVE_INFINITY;
      spots.forEach((s, k) => {
        if (s.tier !== 1) return;
        const gap = Math.abs(
          Math.atan2(
            Math.sin(Math.atan2(s.pos.z, s.pos.x) - want),
            Math.cos(Math.atan2(s.pos.z, s.pos.x) - want),
          ),
        );
        if (gap < bestGap) {
          bestGap = gap;
          best = k;
        }
      });
      if (best < 0) continue;
      const [spot] = spots.splice(best, 1);
      placeAll(parts, build(rand), spot.pos.x, spot.pos.y, spot.pos.z, rand() * Math.PI * 2, 0.8);
    }
  }
  for (const [build, total] of ring) {
    const count = Math.ceil(total * 0.6); // the arena fills the background now, so fewer loose props
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 30; tries++) {
      const a = rand() * Math.PI * 2;
      const fromFront = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)));
      if (fromFront < FRONT_HALF_ANGLE) continue;
      const r = clear + rand() * Math.max(PROP_OUTER_RADIUS - clear, 0.5);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // keep a lane right behind the pedestal clear too, so nothing tall sits behind the target
      if (Math.PI - fromFront < BACK_HALF_ANGLE || (z < 0 && Math.abs(x) < pedestalHalf + 1.5)) continue;
      if (!free(x, z, 2.5)) continue;
      taken.push([x, z]);
      placeAll(parts, build(rand), x, 0, z, rand() * Math.PI * 2, 0.85 + rand() * 0.3);
      placed++;
    }
  }
  // spectators on the grass at the sides of the pedestal, as well as up on the arena
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + side * THREE.MathUtils.degToRad(78 + i * 14);
      const r = clear - 0.8 + rand() * 1.8;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      spots.push({ pos: new THREE.Vector3(x, 0, z), face: faceCentre(x, z), ground: true, tier: -1 });
    }
  }
  return { parts, free: spots };
}

/** A small floating island far away, optionally carrying a prop. */
function islet(theme: ThemeId, size: number, rand: () => number): Part[] {
  const t = THEMES[theme];
  const parts = [
    p(cyl(size, size * 0.97, size * 0.25, 9), t.ground, [0, -size * 0.125, 0]),
    p(cone(size * 0.95, size * 1.3, 9), t.earth, [0, -size * 0.25 - size * 0.65, 0], [Math.PI, 0, 0]),
  ];
  const decor = PROP_SETS[theme].ring[0][0];
  for (let i = 0; i < 2; i++) {
    const a = rand() * Math.PI * 2;
    const built = decor(rand);
    tmpMatrix.compose(
      new THREE.Vector3(Math.cos(a) * size * 0.4, 0, Math.sin(a) * size * 0.4),
      tmpQuat.identity(),
      new THREE.Vector3(size / 5, size / 5, size / 5),
    );
    for (const part of built) part.geo.applyMatrix4(tmpMatrix);
    parts.push(...built);
  }
  return parts;
}

/** Scenery beyond the island: floating islets, mesas, sea islands, the moon. */
function distantScenery(theme: ThemeId, rand: () => number): Part[] {
  const parts: Part[] = [];
  const count = 9;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.4;
    const r = 60 + rand() * 35;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (theme === 'gulch') {
      // flat-topped red mesas rising from far below
      const w = 3.5 + rand() * 4;
      const h = 30 + rand() * 20;
      parts.push(
        p(cyl(w * 0.85, w * 1.1, h, 11), rand() < 0.5 ? 0xc2683f : 0xa9532f, [x, -h / 2 + rand() * 8, z]),
      );
    } else if (theme === 'tiki') {
      // little sandy islands sitting in the sea
      const s = 3 + rand() * 4;
      parts.push(p(ball(s, 1), 0xf0d9a0, [x, -0.7 - s * 0.55, z]));
      placeAll(parts, palm(rand), x, s * 0.35 - 0.7, z, rand() * 6, s / 3);
    } else {
      placeAll(parts, islet(theme, 4 + rand() * 4, rand), x, -8 + rand() * 20, z, rand() * 6, 1);
    }
  }
  if (theme === 'manor') parts.push(p(ball(7, 2), 0xfff4d6, [-45, 55, -110], [0, 0, 0], true));
  return parts;
}

export function merge(parts: Part[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  const geo = mergeGeometries(parts.map((part) => part.geo));
  for (const part of parts) part.geo.dispose();
  return geo;
}

/**
 * Everything decorative for a world, as one group to add to (and later remove from) the scene, plus the
 * free spots where spectators can stand.
 */
export function buildProps(theme: ThemeId, pedestalHalf: number): { group: THREE.Group; spots: Spot[] } {
  const rand = seeded(THEMES[theme].name.length * 131 + 7);
  const stands = arena(theme, rand);
  const island = islandProps(theme, rand, stands.tops, pedestalHalf);
  const parts = [...island.parts, ...distantScenery(theme, rand)];
  const group = new THREE.Group();
  const arenaGeo = merge(stands.parts);
  if (arenaGeo) {
    const mesh = new THREE.Mesh(
      arenaGeo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    );
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const solid = merge(parts.filter((part) => !part.glow));
  const glow = merge(parts.filter((part) => part.glow));
  if (solid) {
    group.add(
      new THREE.Mesh(
        solid,
        new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }),
      ),
    );
  }
  if (glow) group.add(new THREE.Mesh(glow, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  const sea = THEMES[theme].sea;
  if (sea !== undefined) {
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(400, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: sea, roughness: 0.25, metalness: 0.1 }),
    );
    water.position.y = -0.7; // just under the island top, hiding the rocky underside
    group.add(water);
  }
  return { group, spots: island.free };
}

export function disposeGroup(group: THREE.Group) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const mat = o.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
  });
}
