import { describe, expect, it } from 'vitest';
import { parseLevel } from './level';
import { createParty, endDuelTurn, endJengaTurn, MAX_JENGA_TURNS, partyModeFor, topple } from './party';

describe('duel', () => {
  it('alternates players and sums points per player', () => {
    const p = createParty('duel', 2, 2);
    endDuelTurn(p, 100);
    expect(p.current).toBe(1);
    endDuelTurn(p, 0);
    endDuelTurn(p, 200);
    expect(p.winners).toBeNull();
    endDuelTurn(p, 50);
    expect(p.scores).toEqual([300, 50]);
    expect(p.winners).toEqual([0]);
  });

  it('reports ties and clamps the player count', () => {
    const p = createParty('duel', 9, 1);
    expect(p.players).toBe(4);
    for (const gain of [100, 100, 0, 0]) endDuelTurn(p, gain);
    expect(p.winners).toEqual([0, 1]);
  });

  it('ignores turns after the game is decided', () => {
    const p = createParty('duel', 2, 1);
    endDuelTurn(p, 10);
    endDuelTurn(p, 20);
    endDuelTurn(p, 999);
    expect(p.scores).toEqual([10, 20]);
  });
});

describe('jenga-off', () => {
  it('eliminates the player who toppled and rebuilds until one is left', () => {
    const p = createParty('jengaOff', 3, 0);
    endJengaTurn(p); // P1 safe, P2 next
    expect(topple(p)).toBe(true); // P2 out
    expect(p.out).toEqual([false, true, false]);
    expect(p.current).toBe(2); // skips the eliminated player
    expect(topple(p)).toBe(false); // P3 out, P1 wins
    expect(p.winners).toEqual([0]);
  });

  it('ends in a shared win at the turn cap', () => {
    const p = createParty('jengaOff', 2, 0);
    for (let i = 0; i < MAX_JENGA_TURNS; i++) endJengaTurn(p);
    expect(p.winners).toEqual([0, 1]);
  });
});

describe('partyModeFor', () => {
  const base = { id: 'x', name: 'x', throws: 3, medals: { bronze: 1, silver: 2, gold: 3 } };
  const gem = [{ type: 'gem', pos: [0, 0.5, 0] }];

  it('picks the game from the goal and tool', () => {
    expect(partyModeFor(parseLevel({ ...base, goal: { type: 'toppleGems' }, blocks: gem }))).toBe('duel');
    expect(
      partyModeFor(parseLevel({ ...base, tool: 'grab', goal: { type: 'jenga', remove: 3 }, blocks: gem })),
    ).toBe('jengaOff');
  });

  it('rejects levels with nothing to score or a shared water tank', () => {
    const plain = [{ type: 'normal', pos: [0, 0.5, 0] }];
    expect(partyModeFor(parseLevel({ ...base, goal: { type: 'clearBoard' }, blocks: plain }))).toBeNull();
    expect(
      partyModeFor(parseLevel({ ...base, tool: 'hose', goal: { type: 'toppleGems' }, blocks: gem })),
    ).toBeNull();
  });
});
