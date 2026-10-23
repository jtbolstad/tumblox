import { BLOCKS, type BlockType } from './blocks';
import type { Goal } from './level';

/** pulled: a block the player dragged clear of a Jenga tower. */
export type BlockStatus = 'alive' | 'fallen' | 'removed' | 'pulled';
export type Medal = 'bronze' | 'silver' | 'gold';

export interface BlockState {
  type: BlockType;
  status: BlockStatus;
  /** score multiplier of the floor zone the block ended up in (default 1) */
  multiplier?: number;
}

export const UNUSED_THROW_BONUS = 50;

/** Multiplier of the best zone containing floor point (x, z); 1 when outside every zone. */
export function zoneMultiplier(
  zones: readonly { multiplier: number; pos: readonly number[]; size: readonly number[] }[],
  x: number,
  z: number,
): number {
  let best = 1;
  for (const zone of zones) {
    const inside =
      Math.abs(x - zone.pos[0]) <= zone.size[0] / 2 && Math.abs(z - zone.pos[2]) <= zone.size[1] / 2;
    if (inside) best = Math.max(best, zone.multiplier);
  }
  return best;
}

/** Points from blocks that have fallen off the platform. */
export function blockScore(blocks: readonly BlockState[]): number {
  let total = 0;
  for (const b of blocks) {
    if (b.status !== 'fallen') continue;
    const points = BLOCKS[b.type].points;
    // multiplier zones only boost gains; a penalty block costs the same wherever it lands
    total += points > 0 ? points * (b.multiplier ?? 1) : points;
  }
  return total;
}

/** A goal is met when the rule holds; callers only evaluate it once the scene has settled. */
export function goalMet(goal: Goal, blocks: readonly BlockState[]): boolean {
  switch (goal.type) {
    case 'toppleGems': {
      const gems = blocks.filter((b) => b.type === 'gem');
      return gems.length > 0 && gems.every((b) => b.status === 'fallen');
    }
    case 'scoreTarget':
      return blockScore(blocks) >= goal.target;
    case 'clearBoard':
      return blocks.filter((b) => BLOCKS[b.type].mobile).every((b) => b.status !== 'alive');
    case 'jenga':
      return blocks.filter((b) => b.status === 'pulled').length >= goal.remove;
  }
}

/** Final score on a win: block points, chain bonus, and a bonus per unused throw. */
export function finalScore(blocks: readonly BlockState[], throwsLeft: number, bonus = 0): number {
  return blockScore(blocks) + bonus + throwsLeft * UNUSED_THROW_BONUS;
}

/** Seconds of sim time between blasts that still count as one chain reaction. */
export const CHAIN_WINDOW = 1;
export const CHAIN_STEP_BONUS = 25;

/** Bonus for the blast that brings a chain to `length` blasts: none for 1-2, then 25, 50, 75... */
export function chainBonus(length: number): number {
  return length >= 3 ? (length - 2) * CHAIN_STEP_BONUS : 0;
}

export function medalFor(
  score: number,
  medals: { bronze: number; silver: number; gold: number },
): Medal | null {
  if (score >= medals.gold) return 'gold';
  if (score >= medals.silver) return 'silver';
  if (score >= medals.bronze) return 'bronze';
  return null;
}

const MEDAL_RANK: Record<Medal, number> = { bronze: 1, silver: 2, gold: 3 };

export function betterMedal(a: Medal | null, b: Medal | null): Medal | null {
  const ra = a ? MEDAL_RANK[a] : 0;
  const rb = b ? MEDAL_RANK[b] : 0;
  return ra >= rb ? a : b;
}

export type Outcome = 'playing' | 'won' | 'lost';

/**
 * Decide the level result. Only call once the scene has settled and at least one throw is used;
 * evaluating mid-collapse would award wins too early. A collapsed Jenga tower is lost at once.
 */
export function outcome(
  goal: Goal,
  blocks: readonly BlockState[],
  throwsLeft: number,
  collapsed = false,
): Outcome {
  if (goal.type === 'jenga' && collapsed) return 'lost';
  if (goalMet(goal, blocks)) return 'won';
  return throwsLeft <= 0 ? 'lost' : 'playing';
}

/** True once nothing has moved for `quietSeconds`, or everything is asleep. */
export function isSettled(secondsSinceMotion: number, allAsleep: boolean, quietSeconds = 2): boolean {
  return allAsleep || secondsSinceMotion >= quietSeconds;
}
