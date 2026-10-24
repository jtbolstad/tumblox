/**
 * Blocky 5-row letters for the game name. The 3D title scene and the logo script both build from these,
 * one block per '#', so the logo and the knock-down title always match.
 */
import type { BlockType } from '../data/blocks';

export const GAME_NAME = 'Tumble';

/** Block type per letter, which sets its colour. The M is all bombs, so a good hit sets off the word. */
export const LETTER_TYPES: BlockType[] = [
  'normal',
  'gem',
  'bomb',
  'point',
  'wood',
  'normal',
  'ice',
  'gem',
  'point',
  'normal',
];

const GLYPHS: Record<string, string[]> = {
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  L: ['#..', '#..', '#..', '#..', '###'],
  E: ['###', '#..', '##.', '#..', '###'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  S: ['###', '#..', '###', '..#', '###'],
};

export const GLYPH_ROWS = 5;

export interface Cell {
  /** column from the left edge of the whole text, row 0 = bottom */
  col: number;
  row: number;
  /** index of the letter in the text, spaces excluded */
  letter: number;
}

/** Cells of `text` laid out left to right with one empty column between letters and two for a space. */
export function layoutText(text: string): { cells: Cell[]; width: number } {
  const cells: Cell[] = [];
  let col = 0;
  let letter = 0;
  for (const ch of text.toUpperCase()) {
    if (ch === ' ') {
      col += 2;
      continue;
    }
    const glyph = GLYPHS[ch];
    if (!glyph) throw new Error(`no glyph for "${ch}"`);
    glyph.forEach((line, r) => {
      for (let c = 0; c < line.length; c++) {
        if (line[c] === '#') cells.push({ col: col + c, row: GLYPH_ROWS - 1 - r, letter });
      }
    });
    col += glyph[0].length + 1;
    letter++;
  }
  return { cells, width: col - 1 };
}
