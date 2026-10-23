/** Original background loop, synthesised note by note (no audio files). C major, 120 bpm, 8 bars. */
import { audioContext } from './audio';

export const STEP_SECONDS = 0.25; // one eighth note
export const STEPS_PER_BAR = 8;
export const LOOP_STEPS = STEPS_PER_BAR * 8;

export type Voice = 'bass' | 'arp' | 'lead' | 'tick';
export interface MusicNote {
  voice: Voice;
  midi: number;
  /** seconds */
  dur: number;
  gain: number;
}

const CHORDS = [
  [60, 64, 67], // C
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [55, 59, 62], // G
];
const ROOTS = [36, 33, 29, 31];
const N = null;
// one 8-step line per bar, midi pitches from the C pentatonic scale
const LEAD: (number | null)[][] = [
  [79, N, 76, N, 72, N, 76, N],
  [76, N, 72, N, 69, N, 72, N],
  [77, N, 81, N, 77, N, 72, N],
  [74, N, 79, 74, 71, N, 74, N],
  [79, N, 84, N, 79, N, 76, N],
  [76, 72, N, 69, 72, N, 76, N],
  [81, N, 77, N, 72, 77, N, N],
  [74, N, 71, N, 67, N, N, N],
];

/** Everything that starts on a given step of the loop. */
export function notesAt(step: number): MusicNote[] {
  const s = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  const bar = Math.floor(s / STEPS_PER_BAR);
  const beat = s % STEPS_PER_BAR;
  const chordIndex = bar % 4;
  const chord = CHORDS[chordIndex];
  const notes: MusicNote[] = [];
  if (beat === 0) notes.push({ voice: 'bass', midi: ROOTS[chordIndex], dur: 0.45, gain: 0.5 });
  if (beat === 4) notes.push({ voice: 'bass', midi: ROOTS[chordIndex] + 12, dur: 0.35, gain: 0.35 });
  notes.push({ voice: 'arp', midi: chord[beat % 3] + 12, dur: 0.2, gain: 0.16 });
  const lead = LEAD[bar][beat];
  if (lead !== null) notes.push({ voice: 'lead', midi: lead, dur: 0.4, gain: 0.3 });
  if (beat % 2 === 1) notes.push({ voice: 'tick', midi: 0, dur: 0.04, gain: 0.12 });
  return notes;
}

export function midiToHz(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

const MUSIC_KEY = 'blox.music.v1';
const LOOKAHEAD = 0.4; // s of notes scheduled ahead of the audio clock
const MUSIC_VOLUME = 0.22;

let enabled = readEnabled();
let timer: ReturnType<typeof setInterval> | undefined;
let nextTime = 0;
let nextStep = 0;
let bus: GainNode | null = null;
let busCtx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(MUSIC_KEY) !== '0';
  } catch {
    return true;
  }
}

export function isMusicOn() {
  return enabled;
}

export function setMusicOn(value: boolean) {
  enabled = value;
  try {
    localStorage.setItem(MUSIC_KEY, value ? '1' : '0');
  } catch {
    // ignore: the choice just is not remembered
  }
}

function play(c: AudioContext, out: AudioNode, n: MusicNote, when: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(n.gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + n.dur);
  if (n.voice === 'tick') {
    if (!noise) {
      noise = c.createBuffer(1, c.sampleRate / 4, c.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = noise;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    src.connect(hp).connect(g).connect(out);
    src.start(when);
    src.stop(when + n.dur);
    return;
  }
  const osc = c.createOscillator();
  osc.type = n.voice === 'bass' ? 'triangle' : n.voice === 'lead' ? 'sine' : 'square';
  osc.frequency.value = midiToHz(n.midi);
  osc.connect(g).connect(out);
  osc.start(when);
  osc.stop(when + n.dur);
}

function tick() {
  const c = audioContext();
  if (!c || !enabled) {
    nextTime = 0; // resume on the beat grid from "now" once audio is allowed again
    return;
  }
  if (!bus || busCtx !== c) {
    bus = c.createGain();
    bus.gain.value = MUSIC_VOLUME;
    bus.connect(c.destination);
    busCtx = c;
  }
  if (nextTime < c.currentTime) nextTime = c.currentTime + 0.05;
  while (nextTime < c.currentTime + LOOKAHEAD) {
    for (const n of notesAt(nextStep)) play(c, bus, n, nextTime);
    nextStep = (nextStep + 1) % LOOP_STEPS;
    nextTime += STEP_SECONDS;
  }
}

/** Start the scheduler once; it stays silent until audio is unlocked and music is on. */
export function initMusic() {
  if (timer === undefined) timer = setInterval(tick, 100);
}
