import { LETTER_TYPES, layoutText } from './glyphs';
import { gameName } from './i18n';
import { type Level, parseLevel } from './level';
import type { CharacterKind } from './characters';

/** Edge of one title block, in metres. */
export const TITLE_BLOCK = 0.9;

/** Who dances on the letters: neutral animals only, at most five kinds at once. */
const DANCERS: CharacterKind[] = ['goat', 'hen', 'frog', 'parrot', 'fox', 'owl'];

/** The dancers are drawn and simulated this much bigger than normal, to hold their own against the letters. */
const DANCER_SCALE = 2;

/** The title screen as a level: the game name built from blocks, with dancers on top, free throws, no goal. */
export function titleLevel(rand: () => number = Math.random): Level {
  const name = gameName();
  const { cells, width } = layoutText(name);
  const s = TITLE_BLOCK;
  const x = (col: number) => (col - (width - 1) / 2) * s;
  // one dancer on top of each letter, on a cell of its highest row (the middle one, or either of two)
  const letters = new Set(cells.map((c) => c.letter));
  const kinds = [...DANCERS].sort(() => rand() - 0.5).slice(0, 5);
  const characters = [...letters].slice(0, 6).map((letter, i) => {
    const mine = cells.filter((c) => c.letter === letter);
    const topRow = Math.max(...mine.map((c) => c.row));
    const tops = mine.filter((c) => c.row === topRow).sort((a, b) => a.col - b.col);
    const cell = tops[Math.floor(rand() * 0.999 * tops.length)] ?? tops[0];
    const middle = tops.length === 3 ? tops[1] : cell;
    return {
      kind: kinds[i % kinds.length],
      pos: [x(middle.col), (topRow + 1) * s, 0] as [number, number, number],
      role: 'decor' as const,
      rot: 0,
      scale: DANCER_SCALE,
    };
  });
  return parseLevel({
    id: 'title',
    name,
    tool: 'ball',
    throws: 999,
    goal: { type: 'clearBoard' },
    medals: { bronze: 0, silver: 0, gold: 0 },
    platform: { size: [width * s + 1, 2.5], top: 1 },
    blocks: cells.map((c) => ({
      type: LETTER_TYPES[c.letter % LETTER_TYPES.length],
      pos: [x(c.col), (c.row + 0.5) * s, 0],
      size: [s, s, s],
    })),
    characters,
  });
}
