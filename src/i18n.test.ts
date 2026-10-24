import { describe, expect, it } from 'vitest';
import { toNorwegian } from './i18n';
import { levelBrief } from './brief';
import { loadBundledLevels } from './level';
import { THEMES } from './themes';
import { TOOLS } from './tools';

describe('toNorwegian', () => {
  it('translates exact strings and keeps unknown ones', () => {
    expect(toNorwegian('Retry')).toBe('Prøv igjen');
    expect(toNorwegian(' Play ')).toBe(' Spill ');
    expect(toNorwegian('Something new')).toBe('Something new');
  });

  it('translates templated strings and strings joined with a dot', () => {
    expect(toNorwegian('Score 500 · Bomb ball')).toBe('Poeng 500 · Bombeball');
    expect(toNorwegian('3 throws')).toBe('3 kast');
    expect(toNorwegian('Keep the pig squire on the platform!')).toBe('Hold grisejunkeren på plattformen!');
    expect(toNorwegian('4. Gem Tower')).toBe('4. Juveltårnet');
    expect(toNorwegian('P2 wins!')).toBe('P2 vinner!');
  });

  it('translates every level name, world name and briefing line', () => {
    // same in both languages
    const same = new Set(['Ball', 'Laser', 'Fireworks', 'Jenga Jr.']);
    const texts: string[] = [
      ...Object.values(THEMES).map((t) => t.name),
      ...Object.values(TOOLS).map((t) => t.name),
    ];
    for (const [i, level] of loadBundledLevels().entries()) {
      const b = levelBrief(level, i + 1);
      texts.push(level.name, b.goal, ...b.lines.flatMap((l) => l.split(' · ')));
    }
    for (const text of texts.filter((x) => !same.has(x))) expect(toNorwegian(text), text).not.toBe(text);
  });
});
