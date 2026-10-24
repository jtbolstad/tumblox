import { describe, expect, it } from 'vitest';
import { loadBundledLevels, parseLevel } from '../data/level';
import { levelBrief } from './brief';

const base = {
  id: 'x',
  name: 'Test Tower',
  throws: 3,
  goal: { type: 'toppleGems' },
  medals: { bronze: 1, silver: 2, gold: 3 },
  blocks: [{ type: 'gem', pos: [0, 0.5, 0] }],
};

describe('levelBrief', () => {
  it('states the goal, how to play and the budget', () => {
    const b = levelBrief(parseLevel(base), 4);
    expect(b.title).toBe('4. Test Tower');
    expect(b.goal).toMatch(/gem/);
    expect(b.lines[0]).toBe('Flick to throw a ball · 3 throws');
  });

  it('warns about friends, rivals and tricky blocks', () => {
    const b = levelBrief(
      parseLevel({
        ...base,
        tool: 'hose',
        throws: 6,
        blocks: [...base.blocks, { type: 'bomb', pos: [1, 0.5, 0] }],
        characters: [
          { kind: 'hen', pos: [2, 0, 0], role: 'friend' },
          { kind: 'parrot', pos: [-2, 0, 0], role: 'rival' },
        ],
      }),
      1,
    );
    expect(b.lines[0]).toMatch(/6 seconds of water/);
    expect(b.lines).toContain('Keep the hen on the platform!');
    expect(b.lines).toContain('Knock the parrot off for a bonus');
    expect(b.lines.some((l) => l.includes('bombs'))).toBe(true);
    expect(b.lines.length).toBeLessThanOrEqual(4);
  });

  it('has a brief for every bundled level', () => {
    loadBundledLevels().forEach((level, i) => {
      const b = levelBrief(level, i + 1);
      expect(b.goal.length).toBeGreaterThan(10);
      expect(b.lines.length).toBeGreaterThan(0);
    });
  });
});
