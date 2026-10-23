/** Projectiles the player throws. A level picks one; all share the flick-to-throw input. */
export const TOOL_IDS = ['ball', 'heavy', 'bomb', 'bouncy', 'grab', 'laser', 'hose'] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export interface ToolDef {
  name: string;
  color: number;
  radius: number;
  mass: number;
  restitution: number;
  friction: number;
  /** blasts on its first hard impact */
  explodes?: boolean;
  /** not thrown: the player picks up and drags a block instead */
  grab?: boolean;
  /** not thrown: a tap fires an instant beam that nudges the first block it hits */
  laser?: boolean;
  /** not thrown: hold to spray a continuous push; a level's `throws` is seconds of water */
  hose?: boolean;
}

export const TOOLS: Record<ToolId, ToolDef> = {
  ball: { name: 'Ball', color: 0xffb703, radius: 0.35, mass: 4, restitution: 0.2, friction: 0.5 },
  heavy: { name: 'Heavy ball', color: 0x5c677d, radius: 0.45, mass: 14, restitution: 0.1, friction: 0.5 },
  bomb: {
    name: 'Bomb ball',
    color: 0xe63946,
    radius: 0.4,
    mass: 4,
    restitution: 0.1,
    friction: 0.5,
    explodes: true,
  },
  bouncy: { name: 'Bouncy ball', color: 0x80ed99, radius: 0.35, mass: 2, restitution: 0.9, friction: 0.4 },
  laser: { name: 'Laser', color: 0xff3864, radius: 0, mass: 0, restitution: 0, friction: 0, laser: true },
  hose: { name: 'Hose', color: 0x4cc9f0, radius: 0, mass: 0, restitution: 0, friction: 0, hose: true },
  grab: { name: 'Grab', color: 0xffffff, radius: 0, mass: 0, restitution: 0, friction: 0, grab: true },
};
