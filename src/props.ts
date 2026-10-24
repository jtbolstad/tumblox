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
/** A coconut palm: a tall curved, ringed trunk tapering to a crown of drooping, segmented fronds. */
const palm: Builder = (rand) => {
  const parts: Part[] = [];
  const segs = 9;
  const len = 0.62;
  let lean = 0.08 + rand() * 0.1;
  const curve = 0.05 + rand() * 0.05;
  let x = 0;
  let y = 0;
  for (let i = 0; i < segs; i++) {
    const rb = 0.2 - (i / segs) * 0.08;
    const rt = 0.2 - ((i + 1) / segs) * 0.08;
    const mx = x + (Math.sin(lean) * len) / 2;
    const my = y + (Math.cos(lean) * len) / 2;
    parts.push(p(cyl(rt, rb, len, 7), i % 2 ? 0x8f7048 : 0xa8855a, [mx, my, 0], [0, 0, -lean]));
    if (i === 0) parts.push(p(cyl(0.3, 0.34, 0.2, 7), 0x8f7048, [0, 0.1, 0])); // flared foot
    x += Math.sin(lean) * len;
    y += Math.cos(lean) * len;
    lean += curve;
  }
  const fronds = 10;
  const greens = [0x2f8f3f, 0x3fa14a, 0x4fb256];
  for (let k = 0; k < fronds; k++) {
    const a = (k / fronds) * Math.PI * 2 + rand() * 0.3;
    let fx = x;
    let fy = y + 0.05;
    let fz = 0;
    let pitch = 0.55 + rand() * 0.2;
    const flen = 0.7 + rand() * 0.2;
    for (let j = 0; j < 4; j++) {
      const w = 0.42 - j * 0.07;
      const l = flen * (1 - j * 0.1);
      const dx = Math.cos(pitch) * Math.cos(a) * l;
      const dy = Math.sin(pitch) * l;
      const dz = Math.cos(pitch) * Math.sin(a) * l;
      parts.push(
        p(box(l, 0.04, w), greens[(k + j) % 3], [fx + dx / 2, fy + dy / 2, fz + dz / 2], [0, -a, pitch]),
      );
      fx += dx;
      fy += dy;
      fz += dz;
      pitch -= 0.4; // the frond bends over and droops
    }
  }
  for (let i = 0; i < 3; i++) {
    parts.push(p(ball(0.14, 1), 0x5a3a20, [x + (i - 1) * 0.16, y - 0.12, (i % 2) * 0.14 - 0.07]));
  }
  return parts;
};
const torch: Builder = () => [
  p(cyl(0.08, 0.1, 1.8), 0x7a5230, [0, 0.9, 0]),
  p(cyl(0.22, 0.12, 0.3), 0x5a3a20, [0, 1.85, 0]),
  p(cone(0.18, 0.5, 6), 0xffa733, [0, 2.2, 0], [0, 0, 0], true),
];
const STRAW = [0xe6c35c, 0xd4aa45, 0xf0d27a, 0xc79a3c];

/** A straw roof: stacked cone layers, wider toward the eaves, with a shaggy fringe. */
function thatchRoof(radius: number, height: number, y: number, rand: () => number): Part[] {
  const parts: Part[] = [];
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const k = (layers - i) / layers; // 1 at the eaves, small at the peak
    const step = height / layers;
    parts.push(
      p(
        cone(radius * (0.3 + 0.7 * k), step + 0.35, 8),
        STRAW[i % STRAW.length],
        [0, y + (i + 0.5) * step, 0],
        [0, rand() * 3, 0],
      ),
    );
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push(
      p(
        box(0.2, 0.34, 0.1),
        STRAW[(i + 1) % STRAW.length],
        [Math.cos(a) * radius * 0.96, y + 0.08, Math.sin(a) * radius * 0.96],
        [0, -a + Math.PI / 2, 0],
      ),
    );
  }
  parts.push(p(cyl(0.05, 0.05, 0.5, 5), 0x7a5230, [0, y + height + 0.35, 0]));
  return parts;
}

/** A ring of upright wooden planks around a dark core. */
function plankWall(radius: number, height: number, count: number, rand: () => number): Part[] {
  const parts: Part[] = [
    p(cyl(radius * 0.96, radius * 0.96, height * 0.98, 12), 0x5a3a20, [0, height / 2, 0]),
  ];
  const w = (Math.PI * 2 * radius) / count;
  const tones = [0xb98a4e, 0xa8773f, 0xc99a5c, 0x9c6c38];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const h = height * (0.92 + rand() * 0.08);
    parts.push(
      p(
        box(w * 0.86, h, 0.14),
        tones[i % 4],
        [Math.cos(a) * radius, h / 2, Math.sin(a) * radius],
        [0, -a + Math.PI / 2, 0],
      ),
    );
  }
  return parts;
}

/** Carved pole: stacked wooden blocks, each a different face, wings and a feather crown. */
const totem: Builder = (rand) => {
  const parts: Part[] = [];
  const tones = [0x8a5a34, 0xa8703f, 0x7a4a28];
  const bands = [0xc0504d, 0xf2b134, 0x3f9e4a, 0x4f86c6];
  const n = 4;
  for (let i = 0; i < n; i++) {
    const y = 0.4 + i * 0.8;
    parts.push(p(box(0.8, 0.8, 0.8), tones[i % 3], [0, y, 0]));
    parts.push(p(box(0.86, 0.1, 0.86), bands[(i + Math.floor(rand() * 4)) % 4], [0, y - 0.35, 0]));
    parts.push(p(box(0.7, 0.1, 0.06), 0x5a3a20, [0, y + 0.18, 0.41])); // brow
    parts.push(p(box(0.12, 0.12, 0.06), 0xfff4e8, [-0.2, y + 0.06, 0.42]));
    parts.push(p(box(0.12, 0.12, 0.06), 0xfff4e8, [0.2, y + 0.06, 0.42]));
    parts.push(p(box(0.14, 0.24, 0.16), 0x6e4222, [0, y - 0.06, 0.45])); // nose
    parts.push(p(box(0.46, 0.1, 0.06), 0x2a1a12, [0, y - 0.22, 0.42])); // mouth
  }
  const top = n * 0.8;
  parts.push(p(box(2, 0.2, 0.2), 0x8a5a34, [0, 2.2, 0.15])); // wings
  for (const [i, c] of [0xff5d8f, 0xf2b134, 0x3fb7c4, 0x3f9e4a, 0xff5d8f].entries()) {
    parts.push(
      p(
        box(0.1, 0.5 + (i === 2 ? 0.2 : 0), 0.05),
        c,
        [(i - 2) * 0.17, top + 0.3, 0],
        [0, 0, (i - 2) * -0.18],
      ),
    );
  }
  return parts;
};
const hut: Builder = (rand) => [
  ...plankWall(1.45, 1.7, 14, rand),
  p(box(0.7, 1.1, 0.12), 0x3a2414, [0, 0.55, 1.45]),
  p(box(0.9, 0.1, 0.16), 0x8a5a34, [0, 1.15, 1.5]),
  p(box(0.5, 0.5, 0.1), 0xf2b134, [-0.95, 1.05, 1.1], [0, 0.65, 0]),
  ...thatchRoof(2.3, 1.9, 1.5, rand),
];
/** An open straw-roofed shelter on four wooden posts, with a plank bench inside. */
const thatchShade: Builder = (rand) => [
  ...[-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => p(cyl(0.1, 0.12, 2.1), 0x7a5230, [sx * 1.1, 1.05, sz * 0.9])),
  ),
  p(box(2.8, 0.12, 2.3), 0x8a5a34, [0, 2.1, 0]),
  ...thatchRoof(1.9, 1.3, 2.1, rand),
  p(box(1.6, 0.1, 0.5), 0xb98a4e, [0, 0.45, 0]),
  p(box(0.12, 0.45, 0.4), 0x8a5a34, [-0.6, 0.22, 0]),
  p(box(0.12, 0.45, 0.4), 0x8a5a34, [0.6, 0.22, 0]),
];
/** A beach stall: plank counter, straw awning slanting forward. */
const tikiBar: Builder = () => [
  p(box(2, 0.9, 0.7), 0xb98a4e, [0, 0.45, 0]),
  p(box(2.1, 0.08, 0.8), 0x7a5230, [0, 0.92, 0]),
  ...[-1, 1].map((sx) => p(cyl(0.07, 0.07, 2.2), 0x7a5230, [sx * 0.95, 1.1, -0.3])),
  p(box(2.4, 0.14, 1.5), STRAW[0], [0, 2.3, 0.1], [0.28, 0, 0]),
  p(box(2.4, 0.1, 0.5), STRAW[1], [0, 2.0, 0.78], [0.28, 0, 0]),
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
    back: [
      [hut, 3],
      [thatchShade, 1],
    ],
    ring: [
      [palm, 7],
      [tikiBar, 1],
      [thatchShade, 1],
      [torch, 5],
      [totem, 3],
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

/** One arena block as a solid box, for its collider: centre, size [w, h, d] and turn around y. */
export interface Solid {
  pos: THREE.Vector3;
  size: [number, number, number];
  face: number;
}

/** A place for a spectator to stand, facing the play area. */
export interface Spot {
  pos: THREE.Vector3;
  /** rotation around y that faces the centre */
  face: number;
  /** on the grass (true) or on top of an arena block */
  ground: boolean;
}

const darker = (color: number, k: number) => new THREE.Color(color).multiplyScalar(k).getHex();

/**
 * How each world dresses its arena blocks. `decor` builds extras in the block's own frame: origin at the
 * middle of its base, +z facing the play area. `lift` raises the spectators' footing (a grass lid, say).
 */
const ARENA_STYLES: Record<
  ThemeId,
  {
    bevel: number;
    lift: number;
    decor: (w: number, h: number, d: number, color: number, rand: () => number) => Part[];
  }
> = {
  // soft toy blocks with a lid of grass dripping over the front edge
  meadow: {
    bevel: 0.35,
    lift: 0.14,
    decor: (w, h, d, _c, rand) => [
      p(new RoundedBoxGeometry(w + 0.12, 0.2, d + 0.12, 2, 0.08), 0x7bc47f, [0, h + 0.03, 0]),
      ...Array.from({ length: 3 }, (_, i) => {
        const drip = 0.15 + rand() * 0.3;
        return p(box(0.5 + rand() * 0.6, drip, 0.08), 0x6fb873, [
          (i - 1) * w * 0.3,
          h - drip / 2,
          d / 2 + 0.03,
        ]);
      }),
    ],
  },
  // bamboo-bound blocks: a woven band, corner poles and a rail along the front
  tiki: {
    bevel: 0.25,
    lift: 0,
    decor: (w, h, d, _c, rand) => [
      p(box(w + 0.08, 0.3, d + 0.08), 0xc9a86a, [0, h * 0.55, 0]),
      // straw fringe hanging over the front edge
      ...Array.from({ length: Math.max(3, Math.round(w / 0.45)) }, (_, i) =>
        p(box(0.4, 0.3 + rand() * 0.25, 0.1), STRAW[i % STRAW.length], [
          -w / 2 + ((i + 0.5) * w) / Math.max(3, Math.round(w / 0.45)),
          h - 0.1,
          d / 2 + 0.06,
        ]),
      ),
      p(cyl(0.11, 0.11, h + 0.6), 0xb08850, [-w / 2, (h + 0.6) / 2, d / 2]),
      p(cyl(0.11, 0.11, h + 0.6), 0xb08850, [w / 2, (h + 0.6) / 2, d / 2]),
      p(cyl(0.07, 0.07, w), 0xb08850, [0, h + 0.35, d / 2], [0, 0, Math.PI / 2]),
    ],
  },
  // crisp stone with battlements along the front and back edges
  castle: {
    bevel: 0.06,
    lift: 0,
    decor: (w, h, d, color) => {
      const merlons: Part[] = [];
      const n = Math.max(2, Math.round(w / 0.9));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 0.25 + (i * (w - 0.5)) / (n - 1);
        for (const z of [d / 2 - 0.2, -d / 2 + 0.2]) {
          if (i % 2 === 0) merlons.push(p(box(0.5, 0.5, 0.4), darker(color, 0.92), [x, h + 0.25, z]));
        }
      }
      return merlons;
    },
  },
  // saloons: plank walls, a false front along the top, a porch roof on posts, lit windows and swing doors
  gulch: {
    bevel: 0.04,
    lift: 0,
    decor: (w, h, d, color, rand) => {
      const wood = darker(color, 0.7);
      const parts: Part[] = [
        // false front: a taller board across the front edge, the spectators stand behind it
        p(box(w, 0.9, 0.18), darker(color, 0.85), [0, h + 0.45, d / 2 - 0.09]),
        p(box(w * 0.5, 0.45, 0.2), 0xf2e2b8, [0, h + 0.45, d / 2 - 0.08]), // sign board
        // porch: a plank deck, posts along the front, a sloped roof and a railing with balusters
        p(box(w + 0.2, 0.14, 1.3), darker(color, 0.8), [0, 0.07, d / 2 + 0.65]),
        p(box(w + 0.3, 0.14, 1.5), wood, [0, h * 0.5, d / 2 + 0.7], [0.12, 0, 0]),
        p(box(w + 0.3, 0.1, 0.1), wood, [0, 0.55, d / 2 + 1.25]), // rail
        p(box(0.6, 0.1, 0.5), darker(color, 0.8), [0, 0.03, d / 2 + 1.5]), // step
        // swing doors
        p(box(0.45, 0.7, 0.06), wood, [-0.25, 0.45, d / 2 + 0.03]),
        p(box(0.45, 0.7, 0.06), wood, [0.25, 0.45, d / 2 + 0.03]),
      ];
      const posts = Math.max(2, Math.round(w / 2.2) + 1);
      for (let i = 0; i < posts; i++) {
        const x = -w / 2 + 0.15 + (i * (w - 0.3)) / (posts - 1);
        parts.push(p(cyl(0.08, 0.08, h * 0.5, 5), wood, [x, h * 0.25 + 0.07, d / 2 + 1.25]));
      }
      for (let i = 0; i < Math.floor(w / 0.5); i++) {
        parts.push(p(box(0.05, 0.5, 0.05), wood, [-w / 2 + 0.25 + i * 0.5, 0.3, d / 2 + 1.25]));
      }
      // lit upstairs windows
      const windows = Math.max(1, Math.floor(w / 1.8));
      for (let i = 0; i < windows; i++) {
        const x = (i + 0.5 - windows / 2) * (w / windows);
        const lit = rand() < 0.7;
        parts.push(p(box(0.55, 0.7, 0.06), lit ? 0xffc766 : 0x2a2018, [x, h * 0.72, d / 2 + 0.03], [0, 0, 0], lit));
        parts.push(p(box(0.7, 0.08, 0.08), wood, [x, h * 0.72 - 0.4, d / 2 + 0.04]));
      }
      return parts;
    },
  },
  // gloomy slabs with iron spikes along the front and a candle on a corner
  manor: {
    bevel: 0.12,
    lift: 0,
    decor: (w, h, d, _c, rand) => {
      const n = Math.max(3, Math.round(w / 0.5));
      const spikes = Array.from({ length: n }, (_, i) =>
        p(cone(0.05, 0.35, 4), 0x2f2a36, [-w / 2 + 0.2 + (i * (w - 0.4)) / (n - 1), h + 0.17, d / 2 - 0.1]),
      );
      if (rand() < 0.5) {
        const x = rand() < 0.5 ? -w / 2 + 0.3 : w / 2 - 0.3;
        spikes.push(p(cyl(0.07, 0.07, 0.3), 0xf2ead8, [x, h + 0.15, -d / 2 + 0.3]));
        spikes.push(p(cone(0.06, 0.16, 5), 0xffc46b, [x, h + 0.38, -d / 2 + 0.3], [0, 0, 0], true));
      }
      return spikes;
    },
  },
};

/** Tiers of giant blocks, inner to outer: ring radius and ranges for height, width and depth (m). */
const TIERS = [
  { r: 15.5, h: [1.8, 3.8], w: [2.6, 5.2], d: [2.6, 3.6] },
  { r: 19.4, h: [3.8, 7.6], w: [3, 6], d: [2.8, 3.8] },
  { r: 22, h: [6.5, 10], w: [3.5, 6.5], d: [2.2, 2.8] },
] as const;

const lerp = (range: readonly [number, number], t: number) => range[0] + (range[1] - range[0]) * t;
const faceCentre = (x: number, z: number) => Math.atan2(-x, -z);

/** Darker at the foot, lighter at the top, so the giant blocks read as soft painted shapes. */
function shadeByHeight(part: Part, bottom: number, top: number) {
  const pos = part.geo.getAttribute('position');
  const col = part.geo.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.78 + 0.3 * THREE.MathUtils.clamp((pos.getY(i) - bottom) / (top - bottom), 0, 1);
    col.setXYZ(i, Math.min(col.getX(i) * k, 1), Math.min(col.getY(i) * k, 1), Math.min(col.getZ(i) * k, 1));
  }
}

/**
 * Giant pastel blocks ringing the play area like stadium seating, different on every level: two or three
 * tiers, uneven sizes and spacing, a few gaps, some smaller blocks stacked on top. It always stays open
 * toward the default camera (+z). Returns the tops where spectators can stand.
 */
function arena(
  theme: ThemeId,
  rand: () => number,
): { parts: Part[]; tops: (Spot & { tier: number })[]; solids: Solid[] } {
  const palette = THEMES[theme].arena;
  const colour = () => palette[Math.floor(rand() * palette.length)];
  const parts: Part[] = [];
  const tops: (Spot & { tier: number })[] = [];
  const solids: Solid[] = [];
  const open = THREE.MathUtils.degToRad(54 + rand() * 16);
  const tiers = rand() < 0.5 ? TIERS.slice(0, 2) : TIERS;
  const style = ARENA_STYLES[theme];
  const block = (w: number, h: number, d: number, x: number, y: number, z: number, face: number) => {
    const color = colour();
    const part = p(
      new RoundedBoxGeometry(w, h, d, 2, style.bevel),
      color,
      [x, y + h / 2 - 0.05, z],
      [0, face, 0],
    );
    shadeByHeight(part, y, y + h);
    parts.push(part);
    solids.push({ pos: new THREE.Vector3(x, y + h / 2 - 0.05, z), size: [w, h, d], face });
    placeAll(parts, style.decor(w, h, d, color, rand), x, y, z, face, 1);
  };
  tiers.forEach((tier, t) => {
    const end = Math.PI / 2 + 2 * Math.PI - open;
    let a = Math.PI / 2 + open + rand() * 0.25;
    for (;;) {
      if (rand() < 0.18) {
        a += (2 + rand() * 3) / tier.r; // a gap in the stands, so the world behind shows through
        continue;
      }
      const w = lerp(tier.w, rand());
      const h = lerp(tier.h, rand());
      const d = lerp(tier.d, rand());
      if (a + w / tier.r > end) break;
      const mid = a + w / 2 / tier.r;
      const r = tier.r + (rand() - 0.5) * 1.6;
      const x = Math.cos(mid) * r;
      const z = Math.sin(mid) * r;
      const face = faceCentre(x, z) + (rand() - 0.5) * 0.3;
      // the block's own x axis, for placing things along its top
      const ax = Math.cos(face);
      const az = -Math.sin(face);
      block(w, h, d, x, 0, z, face);
      if (rand() < 0.3) {
        // a smaller block stacked on top, off-centre
        const w2 = w * (0.4 + rand() * 0.35);
        const h2 = 1 + rand() * 2.2;
        const off = (rand() - 0.5) * (w - w2);
        const sx = x + ax * off;
        const sz = z + az * off;
        block(w2, h2, d * (0.5 + rand() * 0.3), sx, h, sz, face);
        tops.push({
          pos: new THREE.Vector3(sx, h + h2 - 0.05 + style.lift, sz),
          face,
          ground: false,
          tier: t,
        });
      } else {
        // wide blocks hold two spectators side by side
        const offsets = w > 4.4 ? [-w / 4, w / 4] : [0];
        for (const off of offsets) {
          tops.push({
            pos: new THREE.Vector3(x + ax * off, h - 0.05 + style.lift, z + az * off),
            face,
            ground: false,
            tier: t,
          });
        }
      }
      a += (w + 0.15 + rand() * 0.5) / tier.r;
    }
  });
  return { parts, tops, solids };
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

/**
 * The dark backdrop behind the arena: stars, swags of string lights with bunting hung between poles,
 * and glowing balloons drifting far out. Everything glows (unlit), so it reads against the dimmed sky.
 */
function backdrop(theme: ThemeId, rand: () => number): Part[] {
  const parts: Part[] = [];
  const colours = [...THEMES[theme].arena, 0xfff0b0, 0xff8a7a, 0xffd23f];
  const pick = () => colours[Math.floor(rand() * colours.length)];
  const night = THEMES[theme].stageDark < 0.6;
  if (!night) {
    // daylight worlds: huge trees or palms around the island instead of lights
    const count = 11;
    for (let i = 0; i < count; i++) {
      const a = ((i + rand() * 0.6) / count) * Math.PI * 2;
      const r = 34 + rand() * 24;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (theme === 'tiki') {
        placeAll(parts, palm(rand), x, -0.7, z, rand() * 6, 3.2 + rand() * 2);
      } else {
        const h = 14 + rand() * 12;
        const w = 1.3 + rand() * 0.8;
        parts.push(p(cyl(w * 0.7, w, h + 30, 8), 0x7a4e30, [x, h / 2 - 15, z]));
        for (let c = 0; c < 4; c++) {
          const cr = 5 + rand() * 3.5;
          parts.push(
            p(ball(cr, 1), rand() < 0.5 ? 0x4f9e4f : 0x5fb35a, [
              x + (rand() - 0.5) * 7,
              h + 2 + (c % 2) * 3.5 + rand() * 2,
              z + (rand() - 0.5) * 7,
            ]),
          );
        }
      }
    }
  }
  if (theme === 'castle') {
    // a curtain wall with towers all round, rising from far below
    const n = 9;
    const R = 54;
    const wallH = 13;
    const stone = [0x9a968c, 0xa7a39a, 0x8f8b82];
    const pos = (k: number): [number, number] => [Math.cos((k / n) * Math.PI * 2) * R, Math.sin((k / n) * Math.PI * 2) * R];
    for (let k = 0; k < n; k++) {
      const [x, z] = pos(k);
      const [x2, z2] = pos(k + 1);
      const len = Math.hypot(x2 - x, z2 - z);
      const yaw = -Math.atan2(z2 - z, x2 - x);
      const cx = (x + x2) / 2;
      const cz = (z + z2) / 2;
      parts.push(p(box(len, wallH + 20, 2.4), stone[k % 3], [cx, wallH / 2 - 10, cz], [0, yaw, 0]));
      // battlements along the top, laid out in the wall's own frame
      const merlons = Math.floor(len / 3);
      for (let m = 0; m < merlons; m++) {
        const off = (m + 0.5 - merlons / 2) * 3;
        parts.push(p(box(1.5, 1.3, 2.6), stone[(k + 1) % 3], [cx + Math.cos(yaw) * off, wallH + 0.65, cz - Math.sin(yaw) * off], [0, yaw, 0]));
      }
      // a glowing arrow slit
      parts.push(p(box(0.5, 2.2, 0.2), 0xffc766, [cx + Math.sin(yaw) * 1.25, wallH - 4, cz + Math.cos(yaw) * 1.25], [0, yaw, 0], true));
    }
    for (let k = 0; k < n; k++) {
      const [x, z] = pos(k);
      const h = 22 + rand() * 8;
      parts.push(p(cyl(4.2, 4.6, h + 30, 10), 0xb2aea4, [x, h / 2 - 15, z]));
      parts.push(p(cyl(5, 5, 1.2, 10), 0x8f8b82, [x, h, z])); // overhanging parapet
      parts.push(p(cone(5, 9, 10), k % 2 ? 0x4f6db0 : 0xc0504d, [x, h + 5.1, z]));
      parts.push(p(cyl(0.12, 0.12, 4, 4), 0x5a4a3a, [x, h + 11, z]));
      parts.push(p(box(2.4, 1.4, 0.1), k % 2 ? 0xf2c230 : 0xffffff, [x + 1.3, h + 12, z]));
      for (const dy of [-5, -12]) {
        const a = Math.atan2(z, x);
        parts.push(p(box(0.8, 1.6, 0.3), 0xffc766, [x - Math.cos(a) * 4.2, h + dy, z - Math.sin(a) * 4.2], [0, -a + Math.PI / 2, 0], true));
      }
    }
  }
  // stars
  for (let i = 0; i < (night ? 140 : 0); i++) {
    const a = rand() * Math.PI * 2;
    const el = 0.25 + rand() * 1.2;
    const r = 120;
    parts.push(
      p(
        ball(0.2 + rand() * 0.25),
        rand() < 0.7 ? 0xfff6e0 : pick(),
        [Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(a) * Math.cos(el) * r],
        [0, 0, 0],
        true,
      ),
    );
  }
  // string lights between poles
  const poles = night ? 12 : 0;
  const R = 44;
  const top = 15;
  const at = (k: number): [number, number] => [Math.cos((k / poles) * Math.PI * 2) * R, Math.sin((k / poles) * Math.PI * 2) * R];
  for (let k = 0; k < poles; k++) {
    const [x, z] = at(k);
    const [x2, z2] = at(k + 1);
    parts.push(p(cyl(0.18, 0.25, top + 6, 6), 0x2a2330, [x, (top - 6) / 2, z]));
    parts.push(p(ball(0.5, 1), 0xfff0b0, [x, top + 0.4, z], [0, 0, 0], true));
    const bulbs = 10;
    for (let i = 1; i < bulbs; i++) {
      const t = i / bulbs;
      const sag = Math.sin(t * Math.PI) * 2.6;
      const bx = x + (x2 - x) * t;
      const bz = z + (z2 - z) * t;
      const by = top - sag;
      parts.push(p(ball(0.3, 1), colours[(k + i) % colours.length], [bx, by, bz], [0, 0, 0], true));
      if (i % 2 === 0) {
        // a bunting flag hanging below, turned to face the island
        parts.push(
          p(cone(0.45, 1.1, 3), colours[(k + i + 2) % colours.length], [bx, by - 0.8, bz], [0, -Math.atan2(bz, bx) + Math.PI / 2, Math.PI], true),
        );
      }
    }
  }
  // balloons: a glowing envelope over a dark basket, far out and high
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const r = 70 + rand() * 25;
    const y = 22 + rand() * 25;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    parts.push(p(ball(3 + rand() * 1.5, 1), pick(), [x, y, z], [0, 0, 0], true));
    parts.push(p(ball(1.2, 0), 0xfff0b0, [x, y + 3.2, z], [0, 0, 0], true));
    parts.push(p(box(1.2, 0.9, 1.2), 0x5a3a20, [x, y - 5.2, z]));
  }
  return parts;
}

export function merge(parts: Part[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  const geo = mergeGeometries(parts.map((part) => part.geo));
  for (const part of parts) part.geo.dispose();
  return geo;
}

/** Metres covered by one repeat of the plank texture (4 planks). */
const PLANK_TILE = 2;

/** Warm wooden planks with dark seams and grain, tinted by the vertex colour. */
function plankTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null; // headless (tests): no canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const rand = seeded(53);
  g.fillStyle = '#7d6a58'; // seams
  g.fillRect(0, 0, 256, 256);
  const rows = 4;
  const rowH = 256 / rows;
  for (let row = 0; row < rows; row++) {
    const shade = 215 + Math.floor(rand() * 35);
    g.fillStyle = `rgb(${shade}, ${shade - 6}, ${shade - 16})`;
    g.fillRect(0, row * rowH + 3, 256, rowH - 6);
    g.strokeStyle = 'rgba(90, 60, 30, 0.22)'; // grain
    for (let i = 0; i < 5; i++) {
      const y = row * rowH + 8 + rand() * (rowH - 16);
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + rand() * 6 - 3, 170, y + rand() * 6 - 3, 256, y);
      g.stroke();
    }
    const nailX = rand() < 0.5 ? 14 : 242; // a nail at one end
    g.fillStyle = 'rgba(60, 40, 20, 0.5)';
    g.fillRect(nailX, row * rowH + rowH / 2 - 2, 4, 4);
    g.fillStyle = 'rgba(255, 255, 255, 0.2)'; // lit top edge
    g.fillRect(0, row * rowH + 3, 256, 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Metres covered by one repeat of the masonry texture (4 brick courses). */
const BRICK_TILE = 2.4;

/** Light stone bricks with mortar lines, a little variation per brick; tinted by the vertex colour. */
function masonryTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null; // headless (tests): no canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const rand = seeded(97);
  g.fillStyle = '#9a958c'; // mortar
  g.fillRect(0, 0, 256, 256);
  const rows = 4;
  const rowH = 256 / rows;
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : 64;
    for (let col = -1; col < 2; col++) {
      const x = col * 128 + offset;
      const shade = 225 + Math.floor(rand() * 30);
      g.fillStyle = `rgb(${shade}, ${shade - 3}, ${shade - 8})`;
      g.fillRect(x + 3, row * rowH + 3, 122, rowH - 6);
      g.fillStyle = 'rgba(255, 255, 255, 0.25)'; // lit top edge
      g.fillRect(x + 3, row * rowH + 3, 122, 4);
      g.fillStyle = 'rgba(0, 0, 0, 0.12)'; // shaded bottom edge
      g.fillRect(x + 3, row * rowH + rowH - 9, 122, 6);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Box-projected UVs from world position: each face takes the two axes it spans, so bricks stay the same
 * size on every block and courses run level on every wall.
 */
function worldUVs(geo: THREE.BufferGeometry, tile: number) {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    const [u, v] =
      ay >= ax && ay >= az
        ? [pos.getX(i), pos.getZ(i)]
        : ax >= az
          ? [pos.getZ(i), pos.getY(i)]
          : [pos.getX(i), pos.getY(i)];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * Everything decorative for a world, as one group to add to (and later remove from) the scene, plus the
 * free spots where spectators can stand.
 */
export function buildProps(
  theme: ThemeId,
  pedestalHalf: number,
  seed = 7,
): { group: THREE.Group; spots: Spot[]; solids: Solid[] } {
  const rand = seeded(THEMES[theme].name.length * 131 + seed);
  const stands = arena(theme, rand);
  const island = islandProps(theme, rand, stands.tops, pedestalHalf);
  const parts = [...island.parts, ...distantScenery(theme, rand), ...backdrop(theme, rand)];
  const group = new THREE.Group();
  const arenaGeo = merge(stands.parts.filter((part) => !part.glow));
  parts.push(...stands.parts.filter((part) => part.glow)); // candles join the other glowing bits
  if (arenaGeo) {
    const masonry = THEMES[theme].arenaMasonry
      ? masonryTexture()
      : THEMES[theme].arenaPlanks
        ? plankTexture()
        : null;
    if (masonry) worldUVs(arenaGeo, THEMES[theme].arenaPlanks ? PLANK_TILE : BRICK_TILE);
    const mesh = new THREE.Mesh(
      arenaGeo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, map: masonry }),
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
  return { group, spots: island.free, solids: stands.solids };
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
