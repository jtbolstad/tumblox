import { GAME_NAME, LETTER_TYPES, layoutText } from './glyphs';
import { type Level, parseLevel } from './level';

/** Edge of one title block, in metres. */
export const TITLE_BLOCK = 0.9;

/** The title screen as a level: the game name built from blocks, free throws, no goal. */
export function titleLevel(): Level {
  const { cells, width } = layoutText(GAME_NAME);
  const s = TITLE_BLOCK;
  return parseLevel({
    id: 'title',
    name: GAME_NAME,
    tool: 'ball',
    throws: 999,
    goal: { type: 'clearBoard' },
    medals: { bronze: 0, silver: 0, gold: 0 },
    platform: { size: [width * s + 1, 2.5], top: 1 },
    blocks: cells.map((c) => ({
      type: LETTER_TYPES[c.letter % LETTER_TYPES.length],
      pos: [(c.col - (width - 1) / 2) * s, (c.row + 0.5) * s, 0],
      size: [s, s, s],
    })),
  });
}
