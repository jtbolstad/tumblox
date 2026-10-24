import { describe, expect, it } from 'vitest';
import { parseLevel } from '../data/level';
import { crowdKinds, type MoodInput, moodFor } from './characters';

const calm: MoodInput = { result: null, role: 'decor', speed: 0, spin: 0, ballNear: false, shaking: false };

describe('moodFor', () => {
  it('ranks tumbling over a ball coming over shaking', () => {
    expect(moodFor(calm)).toBe('idle');
    expect(moodFor({ ...calm, shaking: true })).toBe('panic');
    expect(moodFor({ ...calm, shaking: true, ballNear: true })).toBe('alert');
    expect(moodFor({ ...calm, ballNear: true, speed: 4 })).toBe('tumble');
  });

  it('cheers for the player unless it is a rival', () => {
    expect(moodFor({ ...calm, result: 'won', role: 'friend' })).toBe('cheer');
    expect(moodFor({ ...calm, result: 'won', role: 'rival' })).toBe('sad');
    expect(moodFor({ ...calm, result: 'lost', role: 'rival' })).toBe('cheer');
    expect(moodFor({ ...calm, result: 'lost', role: 'decor' })).toBe('sad');
  });
});

describe('level characters', () => {
  const base = {
    id: 'x',
    name: 'x',
    throws: 3,
    goal: { type: 'toppleGems' },
    medals: { bronze: 1, silver: 2, gold: 3 },
    blocks: [{ type: 'gem', pos: [0, 0.5, 0] }],
  };

  it('defaults to none, and to decor', () => {
    expect(parseLevel(base).characters).toEqual([]);
    const lvl = parseLevel({ ...base, characters: [{ kind: 'goat', pos: [1, 0, 1] }] });
    expect(lvl.characters[0]).toMatchObject({ role: 'decor', rot: 0 });
  });

  it('rejects unknown kinds and more than six', () => {
    expect(() => parseLevel({ ...base, characters: [{ kind: 'dragon', pos: [0, 0, 0] }] })).toThrow();
    const seven = Array.from({ length: 7 }, () => ({ kind: 'hen', pos: [0, 0, 0] }));
    expect(() => parseLevel({ ...base, characters: seven })).toThrow();
  });
});

describe('crowdKinds', () => {
  it('keeps world exclusives to their world', () => {
    for (const theme of ['meadow', 'castle', 'gulch'] as const) {
      const kinds = crowdKinds(theme, ['goat', 'totem', 'ghost'], []);
      expect(kinds).not.toContain('totem');
      expect(kinds).not.toContain('ghost');
    }
    expect(crowdKinds('tiki', ['totem'], [])).toContain('totem');
    expect(crowdKinds('manor', ['ghost'], [])).toContain('ghost');
  });

  it('never shows more than 5 kinds with the level characters', () => {
    const kinds = crowdKinds('tiki', ['frog', 'parrot', 'totem', 'hen'], ['goat', 'bat']);
    expect(kinds.length).toBeLessThanOrEqual(5);
    expect(kinds).toEqual(expect.arrayContaining(['goat', 'bat']));
  });
});
