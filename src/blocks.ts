/** Block types are data; `behaviour` hooks are driven by collision events in main.ts. */
export const BLOCK_IDS = [
  'normal',
  'wood',
  'steel',
  'ice',
  'immobile',
  'gem',
  'point',
  'penalty',
  'bomb',
  'chemical',
  'vanish',
  'multivanish',
  'cloud',
  'fragile',
  'fireworks',
  'jingle',
] as const;
export type BlockType = (typeof BLOCK_IDS)[number];

/**
 * explode: blasts on a hard hit. chemical: blasts only when two chemical blocks touch.
 * vanish: disappears after `hits` hard hits (fragile is a vanish that needs a hard hit).
 * fireworks: a hit or nearby blast launches it upward, then it bursts.
 * jingle: plays a note when hit. float: once hit, gravity flips (see gravityScale) and it drifts away.
 */
export type Behaviour = 'explode' | 'chemical' | 'vanish' | 'fireworks' | 'jingle' | 'float';

export interface BlockDef {
  color: number;
  density: number;
  friction: number;
  restitution: number;
  /** false = fixed body, never moves, never counts as fallen or cleared */
  mobile: boolean;
  /** score awarded once the block has fallen off the platform (negative = penalty) */
  points: number;
  behaviour?: Behaviour;
  /** minimum impact speed (m/s) that triggers the behaviour */
  triggerSpeed?: number;
  /** vanish: number of hard hits it survives plus one (default 1) */
  hits?: number;
  /** gravity multiplier applied when a float block is first hit; negative drifts up (cloud) */
  gravityScale?: number;
}

const base = { density: 1, friction: 0.7, restitution: 0.05, mobile: true, points: 0 };

export const BLOCKS: Record<BlockType, BlockDef> = {
  normal: { ...base, color: 0xe9c46a },
  wood: { ...base, color: 0xa47148, density: 0.5, friction: 0.4 },
  steel: { ...base, color: 0x8d99ae, density: 4, friction: 0.5 },
  ice: { ...base, color: 0xbde0fe, density: 0.9, friction: 0.03 },
  immobile: { ...base, color: 0x4a4e57, friction: 0.8, mobile: false },
  gem: { ...base, color: 0x3da5ff, points: 100 },
  point: { ...base, color: 0xffc400, points: 100 },
  penalty: { ...base, color: 0xd81159, points: -100 },
  bomb: { ...base, color: 0xe63946, behaviour: 'explode', triggerSpeed: 3 },
  chemical: { ...base, color: 0x57cc99, behaviour: 'chemical', triggerSpeed: 1 },
  vanish: { ...base, color: 0x9b5de5, density: 0.8, behaviour: 'vanish', triggerSpeed: 1.5 },
  multivanish: { ...base, color: 0x6a4c93, density: 0.8, behaviour: 'vanish', triggerSpeed: 1.5, hits: 3 },
  cloud: {
    ...base,
    color: 0xf1faee,
    density: 0.3,
    friction: 0.5,
    behaviour: 'float',
    triggerSpeed: 1,
    gravityScale: -0.25,
  },
  fragile: { ...base, color: 0xffb3c6, density: 0.7, behaviour: 'vanish', triggerSpeed: 8 },
  fireworks: { ...base, color: 0xff7b00, density: 0.8, behaviour: 'fireworks', triggerSpeed: 2 },
  jingle: { ...base, color: 0x48cae4, behaviour: 'jingle', triggerSpeed: 0.8 },
};
