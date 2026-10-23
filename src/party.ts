import { BLOCKS } from './blocks';
import type { Level } from './level';
import { TOOLS } from './tools';

/** Hot-seat party rules: 2-4 players share one device and alternate turns. */
export type PartyMode = 'duel' | 'jengaOff';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
/** Cap on turns in a Jenga-off round, so a very careful table cannot play forever. */
export const MAX_JENGA_TURNS = 40;

export interface Party {
  mode: PartyMode;
  players: number;
  /** index of the player whose turn it is */
  current: number;
  scores: number[];
  /** Jenga-off: players who toppled a tower are out */
  out: boolean[];
  turnsTaken: number;
  /** duel: turns each player gets */
  turnsEach: number;
  /** set once the game is decided: winning player indices (several on a tie) */
  winners: number[] | null;
}

export function createParty(mode: PartyMode, players: number, turnsEach: number): Party {
  const n = Math.min(Math.max(Math.round(players), MIN_PLAYERS), MAX_PLAYERS);
  return {
    mode,
    players: n,
    current: 0,
    scores: Array<number>(n).fill(0),
    out: Array<boolean>(n).fill(false),
    turnsTaken: 0,
    turnsEach,
    winners: null,
  };
}

/** Total turns in a duel; Jenga-off has no fixed number. */
export function totalTurns(p: Party): number {
  return p.mode === 'duel' ? p.players * p.turnsEach : MAX_JENGA_TURNS;
}

function advance(p: Party) {
  for (let i = 1; i <= p.players; i++) {
    const next = (p.current + i) % p.players;
    if (!p.out[next]) {
      p.current = next;
      return;
    }
  }
}

/** Duel: add the points the current player's turn scored, then pass the turn or finish. */
export function endDuelTurn(p: Party, gained: number) {
  if (p.winners) return;
  p.scores[p.current] += gained;
  p.turnsTaken++;
  if (p.turnsTaken >= totalTurns(p)) {
    const best = Math.max(...p.scores);
    p.winners = p.scores.flatMap((s, i) => (s === best ? [i] : []));
    return;
  }
  advance(p);
}

/** Jenga-off: a turn that left the tower standing. Everyone left wins if the turn cap is reached. */
export function endJengaTurn(p: Party) {
  if (p.winners) return;
  p.turnsTaken++;
  if (p.turnsTaken >= MAX_JENGA_TURNS) {
    p.winners = p.out.flatMap((o, i) => (o ? [] : [i]));
    return;
  }
  advance(p);
}

/**
 * Jenga-off: the current player toppled the tower and is out. Returns true when the tower must be
 * rebuilt for another round, false when one player is left and has won.
 */
export function topple(p: Party): boolean {
  if (p.winners) return false;
  p.out[p.current] = true;
  const left = p.out.flatMap((o, i) => (o ? [] : [i]));
  if (left.length <= 1) {
    p.winners = left;
    return false;
  }
  p.turnsTaken = 0;
  advance(p);
  return true;
}

export function playerLabel(index: number) {
  return `P${index + 1}`;
}

/** Which party game a level can host, or null when it does not suit alternating turns. */
export function partyModeFor(level: Level): PartyMode | null {
  if (level.goal.type === 'jenga') return TOOLS[level.tool].grab ? 'jengaOff' : null;
  if (TOOLS[level.tool].hose) return null; // one tank of water cannot be split into fair turns
  return level.blocks.some((b) => BLOCKS[b.type].points > 0) ? 'duel' : null;
}
