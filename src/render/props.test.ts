import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../characters/characters';
import { THEME_IDS, THEMES } from '../data/themes';
import { buildProps } from './props';

describe('arena and crowd spots', () => {
  for (const theme of THEME_IDS) {
    it(`${theme}: on any level, spectators stay out of the camera's side and off the pedestal`, () => {
      for (const [pedestalHalf, seed] of [
        [3, 7],
        [3, 4242],
        [3, 90001],
        [11, 7],
        [11, 31337],
      ]) {
        const { spots } = buildProps(theme, pedestalHalf, seed);
        expect(spots.length).toBeGreaterThanOrEqual(16); // enough for the High quality crowd
        for (const s of spots) {
          const fromFront = Math.abs(Math.atan2(s.pos.x, s.pos.z)); // 0 = straight toward the camera
          expect(fromFront).toBeGreaterThan(Math.PI / 3);
          expect(Math.hypot(s.pos.x, s.pos.z)).toBeGreaterThan(pedestalHalf);
        }
      }
    });
  }

  it('only invites characters that exist', () => {
    for (const theme of THEME_IDS) {
      for (const kind of THEMES[theme].crowd) expect(CHARACTER_IDS).toContain(kind);
    }
  });
});
