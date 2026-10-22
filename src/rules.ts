import { BLOCKS, type BlockType } from './blocks';
import type { Goal } from './level';

/** pulled: a block the player dragged clear of a Jenga tower. */
export type BlockStatus = 'alive' | 'fallen' | 'removed' | 'pulled';
export type Medal = 'bronze' | 'silver' | 'gold';

export interface BlockState {
  type: BlockType;
  status: BlockStatus;
}

export const UNUSED_THROW_BONUS = 50;

/** Points from blocks that have fallen off the platform. */
export function blockScore(blocks: readonly BlockState[]): number {
  let total = 0;
  for (const b of blocks) if (b.status === 'fallen') total += BLOCKS[b.type].points;
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

/** Final score on a win: block points plus a bonus per unused throw. */
export function finalScore(blocks: readonly BlockState[], throwsLeft: number): number {
  return blockScore(blocks) + throwsLeft * UNUSED_THROW_BONUS;
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
