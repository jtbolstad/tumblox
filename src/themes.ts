import type { CharacterKind } from './characters';

/** Worlds: each level's `theme` picks the sky, island, light and props around it. Block colours never change. */
export const THEME_IDS = ['meadow', 'tiki', 'castle', 'gulch', 'manor'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeDef {
  name: string;
  sky: { top: number; horizon: number; bottom: number };
  /** island top (grass, sand, dust) */
  ground: number;
  /** island underside, from the rim down to the tip */
  earth: number;
  deep: number;
  /** key light: the sun, or the moon at night */
  sun: { color: number; intensity: number };
  hemi: { sky: number; ground: number; intensity: number };
  rim: number;
  pedestal: number;
  /** pedestal texture: wooden planks or stone bricks */
  pedestalStone?: boolean;
  /** a sea around the island instead of open sky below it */
  sea?: number;
  cloud: number;
  /** soft colours of the giant blocks that ring the play area like stadium seating */
  arena: number[];
  /** who comes to watch */
  crowd: CharacterKind[];
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  meadow: {
    name: 'Meadow',
    sky: { top: 0x4f9fd6, horizon: 0xd4eef8, bottom: 0xa9d3ea },
    ground: 0x7bc47f,
    earth: 0xb08968,
    deep: 0x6d4c3d,
    sun: { color: 0xfff1d6, intensity: 2.6 },
    hemi: { sky: 0xe8f4ff, ground: 0xd8c8a8, intensity: 0.75 },
    rim: 0x9ad1ff,
    pedestal: 0xc8a27a,
    cloud: 0xe4f1ff,
    arena: [0xc9c3e6, 0xb8e6d4, 0xf2c4ce, 0xf6d6b8, 0xc4e0f2],
    crowd: ['goat', 'hen', 'fox', 'owl'],
  },
  tiki: {
    name: 'Tiki Isle',
    sky: { top: 0x5b8fd6, horizon: 0xffd1a8, bottom: 0x8fd3d8 },
    ground: 0xf0d9a0,
    earth: 0xd9b77a,
    deep: 0x9c7b4f,
    sun: { color: 0xffd6a8, intensity: 2.7 },
    hemi: { sky: 0xffe6cc, ground: 0xe8d4a8, intensity: 0.8 },
    rim: 0xffb38a,
    pedestal: 0xd9b77a,
    sea: 0x3fb7c4,
    cloud: 0xffe9d9,
    arena: [0xf6d6a8, 0x9fe0d8, 0xf6b8a0, 0xfff0c8, 0xa8d8f0],
    crowd: ['frog', 'parrot', 'fox', 'hen'],
  },
  castle: {
    name: 'Castle Hill',
    sky: { top: 0x6fb3e8, horizon: 0xf3f0d8, bottom: 0xb9d9ea },
    ground: 0x86c46a,
    earth: 0x9c8a74,
    deep: 0x5f5546,
    sun: { color: 0xfff6e0, intensity: 2.6 },
    hemi: { sky: 0xeef6ff, ground: 0xd6d0bc, intensity: 0.75 },
    rim: 0xb0d8ff,
    pedestal: 0xb9b4a8,
    pedestalStone: true,
    cloud: 0xf2f6ff,
    arena: [0xd8d4e8, 0xc8d8e8, 0xe8e0c8, 0xd0e4d0, 0xe8d0d8],
    crowd: ['pig', 'goat', 'owl', 'hen'],
  },
  gulch: {
    name: 'Dusty Gulch',
    sky: { top: 0xe98a4b, horizon: 0xffe3b0, bottom: 0xf6c28b },
    ground: 0xe0b878,
    earth: 0xb5532f,
    deep: 0x7a3420,
    sun: { color: 0xffd9a0, intensity: 2.8 },
    hemi: { sky: 0xffe8c8, ground: 0xe6c49a, intensity: 0.8 },
    rim: 0xffc48a,
    pedestal: 0xb9774f,
    cloud: 0xfff0dc,
    arena: [0xf0c8a0, 0xe8b090, 0xf6dcb0, 0xd8a890, 0xf0d0c0],
    crowd: ['armadillo', 'fox', 'hen', 'goat'],
  },
  manor: {
    name: 'Spooky Manor',
    sky: { top: 0x1d1a3a, horizon: 0x6a5a9a, bottom: 0x2b2450 },
    ground: 0x5d7a58,
    earth: 0x5a4d5e,
    deep: 0x2f2838,
    sun: { color: 0xc8d2ff, intensity: 2.1 },
    hemi: { sky: 0x9a8fe0, ground: 0x6a6080, intensity: 0.9 },
    rim: 0xb58cff,
    pedestal: 0x7a6578,
    cloud: 0x8a80b8,
    arena: [0x6a5a8a, 0x5a6a8a, 0x7a5a7a, 0x4a6a6a, 0x8a7aa0],
    crowd: ['bat', 'ghost', 'owl', 'fox'],
  },
};
