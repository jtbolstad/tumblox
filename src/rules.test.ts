import { describe, expect, it } from 'vitest';
import type { BlockType } from './blocks';
import { loadBundledLevels, parseLevel } from './level';
import {
  type BlockState,
  type BlockStatus,
  betterMedal,
  blockScore,
  finalScore,
  goalMet,
  isSettled,
  medalFor,
  outcome,
} from './rules';

const b = (type: BlockType, status: BlockStatus = 'alive'): BlockState => ({ type, status });

describe('goals', () => {
  it('toppleGems needs every gem fallen', () => {
    const goal = { type: 'toppleGems' } as const;
    expect(goalMet(goal, [b('gem', 'fallen'), b('gem')])).toBe(false);
    expect(goalMet(goal, [b('gem', 'fallen'), b('gem', 'fallen'), b('normal')])).toBe(true);
  });

  it('toppleGems with no gems is never met', () => {
    expect(goalMet({ type: 'toppleGems' }, [b('normal', 'fallen')])).toBe(false);
  });

  it('scoreTarget counts fallen point blocks', () => {
    const goal = { type: 'scoreTarget', target: 200 } as const;
    expect(goalMet(goal, [b('point', 'fallen'), b('point')])).toBe(false);
    expect(goalMet(goal, [b('point', 'fallen'), b('point', 'fallen')])).toBe(true);
  });

  it('clearBoard ignores immobile blocks and counts removed ones', () => {
    const goal = { type: 'clearBoard' } as const;
    expect(goalMet(goal, [b('immobile'), b('normal', 'fallen'), b('bomb', 'removed')])).toBe(true);
    expect(goalMet(goal, [b('immobile'), b('normal')])).toBe(false);
  });
});

describe('score and medals', () => {
  it('adds a bonus per unused throw', () => {
    expect(blockScore([b('gem', 'fallen'), b('point')])).toBe(100);
    expect(finalScore([b('gem', 'fallen')], 2)).toBe(200);
  });

  it('picks the highest medal reached', () => {
    const m = { bronze: 100, silver: 250, gold: 400 };
    expect(medalFor(99, m)).toBeNull();
    expect(medalFor(100, m)).toBe('bronze');
    expect(medalFor(300, m)).toBe('silver');
    expect(medalFor(400, m)).toBe('gold');
  });

  it('keeps the better medal', () => {
    expect(betterMedal('silver', 'bronze')).toBe('silver');
    expect(betterMedal(null, 'bronze')).toBe('bronze');
    expect(betterMedal(null, null)).toBeNull();
  });
});

describe('outcome and settling', () => {
  const goal = { type: 'toppleGems' } as const;

  it('wins on goal, loses only when out of throws', () => {
    expect(outcome(goal, [b('gem', 'fallen')], 0)).toBe('won');
    expect(outcome(goal, [b('gem')], 1)).toBe('playing');
    expect(outcome(goal, [b('gem')], 0)).toBe('lost');
  });

  it('settles after 2 s of quiet or when all asleep', () => {
    expect(isSettled(1.9, false)).toBe(false);
    expect(isSettled(2, false)).toBe(true);
    expect(isSettled(0, true)).toBe(true);
  });
});

describe('level schema', () => {
  const base = {
    id: 't',
    name: 'Test',
    throws: 3,
    goal: { type: 'toppleGems' },
    medals: { bronze: 100, silver: 200, gold: 300 },
    blocks: [{ type: 'gem', pos: [0, 0.5, 0] }],
  };

  it('fills defaults', () => {
    const l = parseLevel(base);
    expect(l.blocks[0].size).toEqual([1, 1, 1]);
    expect(l.platform.top).toBe(1);
    expect(l.tool).toBe('ball');
  });

  it('rejects bad data with a readable message', () => {
    expect(() => parseLevel({ ...base, blocks: [{ type: 'lava', pos: [0, 0, 0] }] })).toThrow(
      /Invalid level/,
    );
    expect(() => parseLevel({ ...base, medals: { bronze: 300, silver: 200, gold: 100 } })).toThrow(/ascend/);
    expect(() => parseLevel({ ...base, goal: { type: 'scoreTarget' } })).toThrow(/Invalid level/);
  });
});

describe('bundled levels', () => {
  it('all parse, have unique ids and a reachable goal', () => {
    const levels = loadBundledLevels();
    expect(levels.length).toBe(18);
    expect(new Set(levels.map((l) => l.id)).size).toBe(levels.length);
    for (const l of levels) {
      if (l.goal.type === 'toppleGems') expect(l.blocks.some((b) => b.type === 'gem')).toBe(true);
    }
  });
});

describe('jenga goal', () => {
  const goal = { type: 'jenga', remove: 2 } as const;

  it('needs enough pulled blocks', () => {
    expect(goalMet(goal, [b('wood', 'pulled'), b('wood')])).toBe(false);
    expect(goalMet(goal, [b('wood', 'pulled'), b('wood', 'pulled'), b('wood')])).toBe(true);
  });

  it('is lost the moment the tower collapses, even with enough pulled', () => {
    const done = [b('wood', 'pulled'), b('wood', 'pulled')];
    expect(outcome(goal, done, 3, true)).toBe('lost');
    expect(outcome(goal, done, 3, false)).toBe('won');
  });
});
