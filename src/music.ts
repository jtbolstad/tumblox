/**
 * Original background music, one track per world, synthesised note by note (no audio files).
 * Melodies are written in scale degrees: "5 . 3 -" = degree 5, rest, degree 3 held for one more step.
 * A trailing ' raises a note an octave, a trailing , lowers it. Each track has an A and a B section
 * played in a form such as AABA, so a loop lasts about a minute before it repeats.
 */
import { duckMusic, musicOutput, onAudioUnlocked } from './audio';
import { fm, hiss, kick, midiToHz, pluck, tone } from './synth';
import type { ThemeId } from './themes';

type Lead = 'marimba' | 'pluck' | 'flute' | 'banjo' | 'theremin' | 'fiddle';
type Comp = 'pluck' | 'marimba' | 'lute' | 'banjo' | 'harpsichord';
type Bass = 'tuba' | 'bass' | 'pluck';
type Drum = 'kick' | 'snare' | 'hat' | 'shaker' | 'log' | 'tom';
export type Instrument = Lead | Comp | Bass | Drum;

interface Section {
  /** chord root per bar, as a scale degree (1-7); the chord is the triad built on it */
  chords: number[];
  /** lead line per bar, one token per step */
  lead: string[];
}

export interface Track {
  /** seconds per step */
  step: number;
  stepsPerBar: number;
  /** midi note of degree 1 in the lead's octave */
  root: number;
  /** semitones of degrees 1-7 */
  scale: number[];
  form: ('A' | 'B')[];
  sections: { A: Section; B: Section };
  /** one bar, one token per step: chord tone of the bass (1, 3, 5, 8) or '.' */
  bass: string;
  /** one bar: 'x' strums the chord, 'a' plays the next arpeggio note, '.' rests */
  comp: string;
  drums: Partial<Record<Drum, string>>;
  /** extra percussion that only plays while a chain reaction is going */
  layer: Partial<Record<Drum, string>>;
  inst: { lead: Lead; comp: Comp; bass: Bass };
  /** western swing: odd steps are played late by this fraction of a step (0 = straight, ~0.33 = triplet shuffle) */
  swing?: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];

export const TRACKS: Record<ThemeId, Track> = {
  // the main theme: bouncy marimba over a tuba, with soft tribal toms
  meadow: {
    step: 0.27,
    stepsPerBar: 8,
    root: 72,
    scale: MAJOR,
    form: ['A', 'A', 'B', 'A'],
    sections: {
      A: {
        chords: [1, 5, 6, 4, 1, 5, 4, 5],
        lead: [
          '5 . 3 . 1 . 3 .',
          '2 . 7, . 5, . 7, .',
          '3 . 1 . 6, . 1 .',
          "4 . 6 . 1' - . .",
          "5 . 3 5 1' . 5 .",
          '7 . 5 . 2 . 5 .',
          '6 . 4 . 1 . 4 6',
          '5 - - . 2 . 7, .',
        ],
      },
      B: {
        chords: [4, 4, 1, 1, 2, 5, 1, 5],
        lead: [
          "1' . 6 . 4 . 6 .",
          "1' . 7 . 6 . 4 .",
          "5 . 3 . 5 . 1' .",
          "3' - 2' . 1' . 5 .",
          '2 . 4 . 6 . 4 .',
          "5 . 7 . 2' . 7 .",
          "1' . 5 . 3 . 5 .",
          '7 - - . 5 . 2 .',
        ],
      },
    },
    bass: '1 . . . 5 . . .',
    comp: '. . x . . . x .',
    drums: { kick: 'x . . . x . . .', tom: '. . . x . . x .', shaker: '. x . x . x . x' },
    layer: { hat: 'x x x x x x x x', tom: 'x . x . x x x x' },
    inst: { lead: 'marimba', comp: 'pluck', bass: 'tuba' },
  },
  // island strum: ukulele-ish plucks, marimba arpeggios, log drums
  tiki: {
    step: 0.29,
    stepsPerBar: 8,
    root: 67,
    scale: MAJOR,
    form: ['A', 'B', 'A', 'B'],
    sections: {
      A: {
        chords: [1, 4, 1, 5, 1, 4, 5, 1],
        lead: [
          "1' . 7 . 5 . 3 .",
          "4 . 6 . 1' . 6 .",
          '5 . 3 . 1 . 3 5',
          '2 - . . 7, . 2 .',
          "1' . 7 . 5 . 3 .",
          "4 . 6 . 1' . 2' .",
          '7 . 5 . 2 . 7, .',
          '1 - - . . . 5, .',
        ],
      },
      B: {
        chords: [6, 4, 1, 5, 6, 4, 5, 5],
        lead: [
          "3 . 6 . 1' . 6 .",
          "4 . 6 . 1' - . .",
          "5 . 3 . 5 . 1' .",
          '7 . 5 . 2 - . .',
          "3' . 1' . 6 . 1' .",
          "4' . 1' . 6 . 4 .",
          "2' . 7 . 5 . 2 .",
          '5 - - . 7, . 2 .',
        ],
      },
    },
    bass: '1 . . 5 . . 8 .',
    comp: 'a a a a a a a a',
    drums: { log: 'x . x . . x . .', shaker: 'x x x x x x x x', kick: 'x . . . x . . .' },
    layer: { tom: '. x . x x . x x', hat: '. x . x . x . x' },
    inst: { lead: 'pluck', comp: 'marimba', bass: 'bass' },
  },
  // a jig in 6/8: recorder over a strummed lute
  castle: {
    step: 0.16,
    stepsPerBar: 6,
    root: 74,
    scale: MAJOR,
    form: ['A', 'A', 'B', 'B'],
    sections: {
      A: {
        chords: [1, 5, 1, 5, 1, 4, 5, 1],
        lead: [
          "5 3 5 1' 5 3",
          '2 7, 2 5 2 7,',
          "3 5 1' 2' 1' 7",
          '6 5 4 3 2 7,',
          "5 3 5 1' 5 3",
          "4 6 1' 4 6 1'",
          '7 6 5 2 3 4',
          '3 - 1 1 - .',
        ],
      },
      B: {
        chords: [4, 1, 4, 5, 4, 1, 5, 1],
        lead: [
          "6 4 6 1' 6 4",
          "5 3 5 1' - 5",
          "6 1' 2' 3' 2' 1'",
          '7 5 2 5 - .',
          "4 6 1' 6 4 6",
          "5 1' 3' 2' 1' 5",
          '7, 2 5 4 3 2',
          '1 - - 1 - .',
        ],
      },
    },
    bass: '1 . . 5 . .',
    comp: 'x . . x . .',
    drums: { tom: 'x . . x . x', kick: 'x . . . . .', shaker: '. . x . . x' },
    layer: { hat: 'x x x x x x', tom: 'x x x x . x' },
    inst: { lead: 'flute', comp: 'lute', bass: 'pluck' },
  },
  // western swing: shuffled fiddle over banjo chops and a walking upright bass, brushed snare
  gulch: {
    step: 0.19,
    swing: 0.32,
    stepsPerBar: 8,
    root: 67,
    scale: MAJOR,
    form: ['A', 'A', 'B', 'A'],
    sections: {
      A: {
        chords: [1, 4, 1, 5, 1, 4, 5, 1],
        lead: [
          "1' . 5 . 3 5 1' .",
          "6 . 4 . 1' . 6 .",
          "5 3 5 1' 5 . 3 .",
          '2 . 5, . 7, 2 5 .',
          "1' . 5 . 3 5 1' 2'",
          "1' . 6 . 4 . 6 .",
          '7 5 2 5 7 . 5 .',
          "1' - . . 1 . . .",
        ],
      },
      B: {
        chords: [4, 4, 1, 1, 5, 5, 1, 1],
        lead: [
          "4 6 1' 6 4 . 6 .",
          "1' . 6 . 4 6 1' .",
          "5 3 1 3 5 . 1' .",
          "3' 2' 1' 5 3 . 5 .",
          "2' 7 5 7 2' . 7 .",
          "5 7 2' 4' 2' . 7 .",
          "1' 5 3 5 1' . 3' .",
          "1' - . . 5 . 1 .",
        ],
      },
    },
    bass: '1 . 3 . 5 . 3 .',
    comp: '. . x . . . x .',
    drums: { kick: 'x . . . x . . .', snare: '. . x . . . x .', shaker: 'x . x x x . x x' },
    layer: { hat: 'x x x x x x x x', tom: '. . x . . . x .' },
    inst: { lead: 'fiddle', comp: 'banjo', bass: 'bass' },
  },
  // a spooky waltz: harpsichord oom-pah-pah under a wobbling theremin
  manor: {
    step: 0.2,
    stepsPerBar: 6,
    root: 69,
    scale: HARMONIC_MINOR,
    form: ['A', 'B', 'A', 'B'],
    sections: {
      A: {
        chords: [1, 4, 5, 1, 6, 4, 5, 5],
        lead: [
          '5 - - - 3 -',
          '4 - - - 6 -',
          '7, - - - 2 -',
          '1 - - - - .',
          '3 - - - 1 -',
          '6 - - - 4 -',
          '7 - 2 - 4 -',
          '3 - - - - .',
        ],
      },
      B: {
        chords: [1, 4, 5, 1, 6, 4, 5, 5],
        lead: [
          "1' - - - 7 -",
          '6 - - - 4 -',
          '5 - - - 7, -',
          '1 - - - 3 -',
          '6 - - - 5 -',
          "4 - 6 - 1' -",
          '7 - - - 5 -',
          '7 - - - - .',
        ],
      },
    },
    bass: '1 . . . . .',
    comp: '. . a . a .',
    drums: { kick: 'x . . . . .' },
    layer: { tom: 'x . . x . .', shaker: '. x . x . x' },
    inst: { lead: 'theremin', comp: 'harpsichord', bass: 'pluck' },
  },
};

export interface MusicNote {
  inst: Instrument;
  midi: number;
  /** seconds */
  dur: number;
  gain: number;
  /** only played while a chain reaction is going */
  layer?: boolean;
}

const tokens = (line: string) => line.trim().split(/\s+/);

/** Midi note of a scale degree (1-based, may exceed 7) above the track root, shifted by octaves. */
function degreeMidi(track: Track, degree: number, octave = 0): number {
  const d = degree - 1;
  return track.root + 12 * (Math.floor(d / 7) + octave) + track.scale[((d % 7) + 7) % 7];
}

/** Parse "5", "1'", "7," into [degree, octave shift]. */
function parseToken(tok: string): [number, number] {
  const degree = Number.parseInt(tok, 10);
  const octave = (tok.match(/'/g)?.length ?? 0) - (tok.match(/,/g)?.length ?? 0);
  return [degree, octave];
}

export function loopSteps(track: Track): number {
  return track.form.length * 8 * track.stepsPerBar;
}

const DRUM_GAIN: Record<Drum, number> = {
  kick: 0.55,
  snare: 0.18,
  hat: 0.07,
  shaker: 0.06,
  log: 0.3,
  tom: 0.22,
};

/** Everything that starts on a given step of a track's loop. */
export function notesAt(track: Track, step: number): MusicNote[] {
  const total = loopSteps(track);
  const s = ((step % total) + total) % total;
  const spb = track.stepsPerBar;
  const barInSong = Math.floor(s / spb);
  const section = track.sections[track.form[Math.floor(barInSong / 8)]];
  const bar = barInSong % 8;
  const beat = s % spb;
  const chordRoot = section.chords[bar];
  const notes: MusicNote[] = [];

  const leadLine = tokens(section.lead[bar]);
  const tok = leadLine[beat];
  if (tok && tok !== '.' && tok !== '-') {
    let held = 1;
    while (leadLine[beat + held] === '-') held++;
    const [degree, octave] = parseToken(tok);
    notes.push({
      inst: track.inst.lead,
      midi: degreeMidi(track, degree, octave),
      dur: held * track.step,
      gain: 0.3,
    });
  }

  const bassTok = tokens(track.bass)[beat];
  if (bassTok && bassTok !== '.') {
    const offset = { '1': 0, '3': 2, '5': 4, '8': 7 }[bassTok] ?? 0;
    notes.push({
      inst: track.inst.bass,
      midi: degreeMidi(track, chordRoot + offset, -2),
      dur: track.step * 2,
      gain: 0.32,
    });
  }

  const compTok = tokens(track.comp)[beat];
  if (compTok === 'x') {
    for (const k of [0, 2, 4]) {
      notes.push({
        inst: track.inst.comp,
        midi: degreeMidi(track, chordRoot + k, -1),
        dur: track.step * 1.5,
        gain: 0.1,
      });
    }
  } else if (compTok === 'a') {
    const k = [0, 2, 4, 2][beat % 4];
    notes.push({
      inst: track.inst.comp,
      midi: degreeMidi(track, chordRoot + k, -1),
      dur: track.step * 1.5,
      gain: 0.12,
    });
  }

  for (const [layer, kit] of [
    [false, track.drums],
    [true, track.layer],
  ] as const) {
    for (const [drum, pattern] of Object.entries(kit) as [Drum, string][]) {
      if (tokens(pattern)[beat] === 'x')
        notes.push({ inst: drum, midi: 0, dur: 0.1, gain: DRUM_GAIN[drum], layer });
    }
  }
  return notes;
}

/** Schedule one note on any context (the live one, or an offline one for rendering). */
export function scheduleNote(c: BaseAudioContext, out: AudioNode, n: MusicNote, when: number) {
  const f = midiToHz(n.midi);
  switch (n.inst) {
    case 'marimba':
      return fm(c, out, when, f, { ratio: 4, index: 2.5, decay: Math.min(n.dur, 0.5), gain: n.gain });
    case 'pluck':
      return pluck(c, out, when, f, { gain: n.gain * 1.2, seconds: Math.max(n.dur, 0.6), bright: 0.7 });
    case 'lute':
      return pluck(c, out, when, f, { gain: n.gain * 1.4, seconds: 0.8, damping: 0.497, bright: 0.5 });
    case 'banjo':
      return pluck(c, out, when, f, { gain: n.gain * 1.3, seconds: 0.5, damping: 0.495, bright: 1 });
    case 'fiddle': {
      // bowed: a quick scoop up into each note, then the note itself with vibrato and a slightly rough edge
      tone(c, out, when, f * 0.944, {
        type: 'sawtooth',
        gain: n.gain * 0.3,
        decay: 0.06,
        attack: 0.01,
        glideTo: f,
        lowpass: 3000,
      });
      return tone(c, out, when + 0.05, f, {
        type: 'sawtooth',
        gain: n.gain * 0.55,
        decay: Math.max(n.dur - 0.05, 0.25),
        attack: 0.025,
        vibrato: 0.009,
        lowpass: 3200,
      });
    }
    case 'harpsichord':
      return pluck(c, out, when, f, { gain: n.gain * 1.4, seconds: 1, damping: 0.499, bright: 1 });
    case 'flute':
      return tone(c, out, when, f, {
        type: 'sine',
        gain: n.gain * 0.8,
        decay: n.dur,
        attack: 0.03,
        vibrato: 0.006,
      });
    case 'theremin':
      return tone(c, out, when, f, {
        type: 'sine',
        gain: n.gain * 0.7,
        decay: n.dur,
        attack: 0.12,
        vibrato: 0.025,
      });
    case 'tuba':
      return tone(c, out, when, f, {
        type: 'sawtooth',
        gain: n.gain,
        decay: n.dur,
        attack: 0.02,
        lowpass: 500,
      });
    case 'bass':
      return tone(c, out, when, f, { type: 'triangle', gain: n.gain * 1.3, decay: n.dur, attack: 0.01 });
    case 'kick':
      return kick(c, out, when, n.gain);
    case 'snare':
      return hiss(c, out, when, { gain: n.gain, decay: 0.12, filter: 'bandpass', freq: 2500, q: 0.6 });
    case 'hat':
      return hiss(c, out, when, { gain: n.gain, decay: 0.04, filter: 'highpass', freq: 7000 });
    case 'shaker':
      return hiss(c, out, when, { gain: n.gain, decay: 0.06, filter: 'highpass', freq: 5000, attack: 0.015 });
    case 'log':
      return fm(c, out, when, 196, { ratio: 1.5, index: 1, decay: 0.2, gain: n.gain });
    case 'tom':
      return tone(c, out, when, 160, { type: 'sine', gain: n.gain, decay: 0.18, attack: 0.003, glideTo: 90 });
  }
}

const LOOKAHEAD = 0.4; // s of notes scheduled ahead of the audio clock
const EXCITED_SECONDS = 4;

let timer: ReturnType<typeof setInterval> | undefined;
let current: Track = TRACKS.meadow;
let pending: Track | null = null;
let nextTime = 0;
let nextStep = 0;
let excitedUntil = 0;

/** Play a world's track; the switch waits for the next bar line so it lands on the beat. */
export function setTrack(theme: ThemeId) {
  const track = TRACKS[theme];
  if (track !== current) pending = track;
}

/** A chain reaction is going: bring in the extra percussion for a few seconds. */
export function exciteMusic() {
  const o = musicOutput();
  if (o) excitedUntil = o.c.currentTime + EXCITED_SECONDS;
}

function tick() {
  const o = musicOutput();
  if (!o) {
    nextTime = 0; // resume on the beat grid from "now" once audio is allowed again
    return;
  }
  if (nextTime < o.c.currentTime) nextTime = o.c.currentTime + 0.05;
  while (nextTime < o.c.currentTime + LOOKAHEAD) {
    if (pending && nextStep % current.stepsPerBar === 0) {
      current = pending;
      pending = null;
      nextStep = 0;
      duckMusic(0.2, 0.6); // soften the seam between tracks
    }
    const excited = nextTime < excitedUntil;
    // swing: the off-beat steps land late, which gives the shuffle
    const late = nextStep % 2 === 1 ? (current.swing ?? 0) * current.step : 0;
    for (const n of notesAt(current, nextStep))
      if (!n.layer || excited) scheduleNote(o.c, o.out, n, nextTime + late);
    nextStep = (nextStep + 1) % loopSteps(current);
    nextTime += current.step;
  }
}

/**
 * Where the music is right now, counted in beats (fractional, keeps rising), corrected for output latency
 * so dancers move with what is heard. Null while the music is silent.
 */
export function musicBeat(): number | null {
  const o = musicOutput();
  if (!o || nextTime === 0) return null;
  const heard = o.c.currentTime - (o.c.outputLatency || o.c.baseLatency || 0);
  const step = nextStep - (nextTime - heard) / current.step;
  // 4/4 tracks count eighths, 6/8 tracks dotted quarters
  return step / (current.stepsPerBar === 6 ? 3 : 2);
}

/** Start the scheduler once; it stays silent until audio is unlocked and the music volume is up. */
export function initMusic() {
  if (timer === undefined) {
    timer = setInterval(tick, 100);
    onAudioUnlocked(tick); // start on the beat of the first gesture, not up to 100 ms later
  }
}
