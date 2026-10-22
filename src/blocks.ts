/** Block types are data; `behaviour` hooks are driven by collision events in main.ts. */
export const BLOCK_IDS = ['normal', 'immobile', 'gem', 'point', 'bomb', 'vanish'] as const;
export type BlockType = (typeof BLOCK_IDS)[number];

export type Behaviour = 'explode' | 'vanish';

export interface BlockDef {
  color: number;
  density: number;
  friction: number;
  restitution: number;
  /** false = fixed body, never moves, never counts as fallen or cleared */
  mobile: boolean;
  /** score awarded once the block has fallen off the platform */
  points: number;
  behaviour?: Behaviour;
  /** minimum impact speed (m/s) that triggers the behaviour */
  triggerSpeed?: number;
}

export const BLOCKS: Record<BlockType, BlockDef> = {
  normal: { color: 0xe9c46a, density: 1, friction: 0.7, restitution: 0.05, mobile: true, points: 0 },
  immobile: { color: 0x4a4e57, density: 1, friction: 0.8, restitution: 0.05, mobile: false, points: 0 },
  gem: { color: 0x3da5ff, density: 1, friction: 0.7, restitution: 0.05, mobile: true, points: 100 },
  point: { color: 0xffc400, density: 1, friction: 0.7, restitution: 0.05, mobile: true, points: 100 },
  bomb: {
    color: 0xe63946,
    density: 1,
    friction: 0.7,
    restitution: 0.05,
    mobile: true,
    points: 0,
    behaviour: 'explode',
    triggerSpeed: 3,
  },
  vanish: {
    color: 0x9b5de5,
    density: 0.8,
    friction: 0.7,
    restitution: 0.05,
    mobile: true,
    points: 0,
    behaviour: 'vanish',
    triggerSpeed: 1.5,
  },
};
