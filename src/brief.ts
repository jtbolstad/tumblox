import { BLOCKS, type BlockType } from './blocks';
import { CHARACTERS } from './characters';
import type { Level } from './level';
import { TOOLS } from './tools';

/** What the start-of-level banner says: the goal in a sentence, how to play, and what to watch out for. */
export interface Brief {
  title: string;
  goal: string;
  lines: string[];
}

const TOOL_HOW: Record<Level['tool'], string> = {
  ball: 'Flick to throw a ball',
  heavy: 'Flick to throw a heavy ball',
  bouncy: 'Flick to throw a bouncy ball',
  bomb: 'Flick to throw: your balls explode when they hit',
  laser: 'Tap a block to zap it with the laser',
  hose: 'Hold down to spray water and push blocks',
  grab: 'Press on a block and drag it out',
};

/** One hint per special block, most important first; the banner shows only the first one or two. */
const BLOCK_HINTS: [BlockType, string][] = [
  ['bomb', 'Red bombs explode when hit hard'],
  ['chemical', 'Green chemicals blow up when two of them touch'],
  ['penalty', 'Pink penalty blocks cost 100 if they fall'],
  ['vanish', 'Purple blocks vanish when hit'],
  ['multivanish', 'Dark purple blocks need three hits to vanish'],
  ['fireworks', 'Fireworks shoot up and burst when hit'],
  ['fragile', 'Pink cracked blocks shatter only on a hard hit'],
  ['cloud', 'Clouds float away once something bumps them'],
  ['ice', 'Ice is slippery'],
  ['steel', 'Steel is heavy and hard to shift'],
];

function goalSentence(level: Level): string {
  const goal = level.goal;
  switch (goal.type) {
    case 'toppleGems':
      return 'Knock every blue gem off the platform';
    case 'scoreTarget':
      return `Score ${goal.target}: gold blocks are worth 100 when they fall`;
    case 'clearBoard':
      return 'Clear every block off the platform';
    case 'jenga':
      return `Pull ${goal.remove} blocks out without toppling the tower`;
  }
}

export function levelBrief(level: Level, number: number): Brief {
  const throws = level.throws;
  const tool = TOOLS[level.tool];
  const budget = tool.hose
    ? `${throws} seconds of water`
    : `${throws} ${tool.grab ? 'grab' : tool.laser ? 'shot' : 'throw'}${throws === 1 ? '' : 's'}`;
  const lines = [`${TOOL_HOW[level.tool]} · ${budget}`];
  for (const c of level.characters) {
    const name = CHARACTERS[c.kind].name.toLowerCase();
    if (c.role === 'friend') lines.push(`Keep the ${name} on the platform!`);
    else if (c.role === 'rival') lines.push(`Knock the ${name} off for a bonus`);
  }
  const types = new Set(level.blocks.map((b) => b.type));
  const hints = BLOCK_HINTS.filter(([type]) => types.has(type) && BLOCKS[type]).map(([, text]) => text);
  lines.push(...hints.slice(0, 2));
  if (level.zones.length > 0) lines.push('Land gold blocks in the ×2 / ×3 zones for more points');
  return { title: `${number}. ${level.name}`, goal: goalSentence(level), lines: lines.slice(0, 4) };
}
