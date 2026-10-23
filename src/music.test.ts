import { describe, expect, it } from 'vitest';
import { loopSteps, notesAt, TRACKS } from './music';
import { midiToHz } from './synth';
import { THEME_IDS } from './themes';

describe('music tracks', () => {
  it('has one track per world', () => {
    expect(Object.keys(TRACKS).sort()).toEqual([...THEME_IDS].sort());
  });

  for (const [id, track] of Object.entries(TRACKS)) {
    describe(id, () => {
      it('writes one token per step in every bar', () => {
        for (const section of [track.sections.A, track.sections.B]) {
          expect(section.chords).toHaveLength(8);
          expect(section.lead).toHaveLength(8);
          for (const line of section.lead) expect(line.trim().split(/\s+/)).toHaveLength(track.stepsPerBar);
        }
        for (const line of [
          track.bass,
          track.comp,
          ...Object.values(track.drums),
          ...Object.values(track.layer),
        ]) {
          expect(line.trim().split(/\s+/)).toHaveLength(track.stepsPerBar);
        }
      });

      it('wraps around the loop and only emits audible, finite notes', () => {
        const total = loopSteps(track);
        expect(notesAt(track, total + 5)).toEqual(notesAt(track, 5));
        let leads = 0;
        for (let s = 0; s < total; s++) {
          for (const n of notesAt(track, s)) {
            expect(n.gain).toBeGreaterThan(0);
            expect(n.dur).toBeGreaterThan(0);
            expect(Number.isFinite(midiToHz(n.midi))).toBe(true);
            if (n.inst === track.inst.lead) leads++;
          }
        }
        expect(leads).toBeGreaterThan(total / 8); // a real melody, not a few stray notes
      });

      it('keeps the melody in a comfortable range', () => {
        for (let s = 0; s < loopSteps(track); s++) {
          for (const n of notesAt(track, s)) {
            if (n.inst === track.inst.lead) expect(n.midi).toBeGreaterThanOrEqual(55);
            if (n.inst === track.inst.lead) expect(n.midi).toBeLessThanOrEqual(100);
          }
        }
      });

      it('has extra percussion for chain reactions', () => {
        const layered = Array.from({ length: track.stepsPerBar }, (_, s) => notesAt(track, s)).flat();
        expect(layered.some((n) => n.layer)).toBe(true);
      });
    });
  }
});
