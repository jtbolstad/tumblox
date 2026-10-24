import { describe, expect, it } from 'vitest';
import { GLYPH_ROWS, layoutText } from './glyphs';
import { gameName } from './i18n';
import { titleLevel } from './title';

describe('layoutText', () => {
  it('spaces letters by one column and words by two', () => {
    const { cells, width } = layoutText('TI');
    expect(width).toBe(7); // 3 + 1 + 3
    expect(cells.filter((c) => c.letter === 1).every((c) => c.col >= 4)).toBe(true);
    expect(layoutText('T I').width).toBe(9); // 3 + 1 + 2 + 3
  });

  it('puts row 0 at the bottom', () => {
    const t = layoutText('T').cells;
    expect(t.filter((c) => c.row === GLYPH_ROWS - 1)).toHaveLength(3); // the T's crossbar is on top
    expect(t.filter((c) => c.row === 0)).toHaveLength(1);
  });

  it('rejects letters without a glyph', () => {
    expect(() => layoutText('Q')).toThrow();
  });
});

describe('titleLevel', () => {
  it('builds a valid level with one block per cell, all on the platform', () => {
    const level = titleLevel();
    expect(level.blocks).toHaveLength(layoutText(gameName()).cells.length);
    const half = level.platform.size[0] / 2;
    expect(level.blocks.every((b) => Math.abs(b.pos[0]) < half)).toBe(true);
  });
});
