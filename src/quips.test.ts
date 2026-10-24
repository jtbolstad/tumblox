import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from './characters';
import { ALL_QUIPS, QUIPS, quipFor } from './quips';

describe('quips', () => {
  it('gives every character kind lines of its own', () => {
    for (const kind of CHARACTER_IDS) expect(QUIPS[kind].length, kind).toBeGreaterThanOrEqual(2);
  });

  it('has a Norwegian line that differs from the English for every quip', () => {
    for (const [en, nb] of ALL_QUIPS) {
      expect(nb.length, en).toBeGreaterThan(0);
      expect(nb, en).not.toBe(en);
    }
  });

  it('always returns some text', () => {
    for (const kind of CHARACTER_IDS) expect(quipFor(kind).length).toBeGreaterThan(0);
  });
});
