import { describe, expect, it } from 'vitest';
import { LOOP_STEPS, midiToHz, notesAt } from './music';

describe('music loop', () => {
  it('wraps around the loop', () => {
    expect(notesAt(LOOP_STEPS + 3)).toEqual(notesAt(3));
    expect(notesAt(-1)).toEqual(notesAt(LOOP_STEPS - 1));
  });

  it('puts a bass note on the first beat of every bar', () => {
    for (let bar = 0; bar < 8; bar++) {
      expect(notesAt(bar * 8).some((n) => n.voice === 'bass')).toBe(true);
    }
  });

  it('only emits audible, finite notes', () => {
    for (let s = 0; s < LOOP_STEPS; s++) {
      for (const n of notesAt(s)) {
        expect(n.gain).toBeGreaterThan(0);
        expect(n.dur).toBeGreaterThan(0);
        if (n.voice !== 'tick') expect(Number.isFinite(midiToHz(n.midi))).toBe(true);
      }
    }
  });

  it('maps A4 to 440 Hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
  });
});
