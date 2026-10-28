/**
 * Synthesised sound (no audio files), so there is nothing to license or load. Three buses with their own
 * volume (music, effects, voices) feed a master gain; music and effects share a soft reverb.
 */

import type { ThemeId } from '../data/themes';
import { fm, hiss, makeReverb, midiToHz, pluck, tone } from './synth';

export type ImpactKind = 'wood' | 'metal' | 'glass' | 'thud';
export type Channel = 'music' | 'effects' | 'voices';

const MUTE_KEY = 'blox.muted.v1';
const VOLUME_KEY = 'blox.volume.v1';
const DEFAULT_VOLUME: Record<Channel, number> = { music: 0.7, effects: 1, voices: 0.8 };

let ctx: AudioContext | null = null;
let lastImpact = 0;

interface Graph {
  master: GainNode;
  buses: Record<Channel, GainNode>;
  /** music goes through this before its bus, so explosions can duck it without touching the volume */
  musicDuck: GainNode;
}
let graph: Graph | null = null;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function readVolumes(): Record<Channel, number> {
  const v = { ...DEFAULT_VOLUME };
  try {
    Object.assign(v, JSON.parse(localStorage.getItem(VOLUME_KEY) ?? '{}'));
    // carry over the old on/off switches
    if (localStorage.getItem('blox.music.v1') === '0') v.music = 0;
    if (localStorage.getItem('blox.voices.v1') === '0') v.voices = 0;
  } catch {
    // storage blocked or corrupt: defaults
  }
  return v;
}

let muted = readMuted();
const volumes = readVolumes();

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // ignore: the choice just is not remembered
  }
}

export function getVolume(channel: Channel) {
  return volumes[channel];
}

export function setVolume(channel: Channel, value: number) {
  volumes[channel] = Math.min(Math.max(value, 0), 1);
  if (graph && ctx) graph.buses[channel].gain.setTargetAtTime(volumes[channel], ctx.currentTime, 0.05);
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(volumes));
    localStorage.removeItem('blox.music.v1');
    localStorage.removeItem('blox.voices.v1');
  } catch {
    // ignore: the choice just is not remembered
  }
}

function buildGraph(c: AudioContext): Graph {
  const master = c.createGain();
  // a gentle limiter: many synthesised layers can stack up in a big chain reaction
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter).connect(c.destination);
  const reverb = makeReverb(c);
  reverb.connect(master);
  const buses = {} as Record<Channel, GainNode>;
  for (const channel of ['music', 'effects', 'voices'] as Channel[]) {
    const bus = c.createGain();
    bus.gain.value = volumes[channel];
    bus.connect(master);
    buses[channel] = bus;
  }
  for (const [channel, amount] of [
    ['music', 0.3],
    ['effects', 0.12],
  ] as const) {
    const send = c.createGain();
    send.gain.value = amount;
    buses[channel].connect(send).connect(reverb);
  }
  const musicDuck = c.createGain();
  musicDuck.connect(buses.music);
  return { master, buses, musicDuck };
}

/** Browsers only allow audio after a user gesture; call this from input handlers. */
export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      graph = buildGraph(ctx);
    } catch {
      return;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().then(() => runningListeners.forEach((fn) => fn()));
  else runningListeners.forEach((fn) => fn());
}

const runningListeners: (() => void)[] = [];

/** Call `fn` whenever audio has just been unlocked (the first gesture), so music can start that instant. */
export function onAudioUnlocked(fn: () => void) {
  runningListeners.push(fn);
}

/**
 * Browsers only let audio start after a gesture. Try right away (it works when the site is trusted),
 * and otherwise unlock on the very first click, key or touch anywhere on the page.
 */
export function unlockOnFirstGesture() {
  unlockAudio();
  const events = ['pointerdown', 'keydown', 'touchstart', 'click'] as const;
  const once = () => {
    unlockAudio();
    if (ctx?.state === 'running') for (const e of events) removeEventListener(e, once, true);
  };
  for (const e of events) addEventListener(e, once, true);
}

function out(): AudioContext | null {
  return muted || !ctx || ctx.state !== 'running' ? null : ctx;
}

/** The running context and the music input, or null while muted or not yet unlocked (music scheduler). */
export function musicOutput(): { c: AudioContext; out: AudioNode } | null {
  const c = out();
  return c && graph && volumes.music > 0 ? { c, out: graph.musicDuck } : null;
}

function fx(): { c: AudioContext; out: AudioNode } | null {
  const c = out();
  return c && graph && volumes.effects > 0 ? { c, out: graph.buses.effects } : null;
}

/** Dip the music for a moment so a blast or a stinger is heard clearly. */
export function duckMusic(depth = 0.35, seconds = 0.7) {
  if (!ctx || !graph) return;
  const g = graph.musicDuck.gain;
  const t = ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(depth, t, 0.02);
  g.setTargetAtTime(1, t + seconds * 0.3, seconds * 0.3);
}

// ---------- effects ----------

/** Impact by material; louder with speed, with random pitch so repeats do not sound identical. */
export function playImpact(kind: ImpactKind, speed: number) {
  const o = fx();
  if (!o) return;
  const now = performance.now();
  if (now - lastImpact < 35) return; // a collapse fires dozens of contacts at once
  lastImpact = now;
  const vol = Math.min(speed / 12, 1) * 0.4;
  if (vol < 0.02) return;
  const pitch = 0.9 + Math.random() * 0.25;
  const t = o.c.currentTime;
  switch (kind) {
    case 'wood':
      pluck(o.c, o.out, t, 210 * pitch, { gain: vol * 1.4, seconds: 0.12, damping: 0.46, bright: 0.6 });
      hiss(o.c, o.out, t, { gain: vol * 0.4, decay: 0.04, filter: 'bandpass', freq: 2400 });
      break;
    case 'metal':
      fm(o.c, o.out, t, 620 * pitch, { ratio: 2.76, index: 3, decay: 0.45, gain: vol * 0.6 });
      break;
    case 'glass':
      fm(o.c, o.out, t, 1400 * pitch, { ratio: 3.5, index: 1.5, decay: 0.3, gain: vol * 0.45 });
      break;
    case 'thud':
      tone(o.c, o.out, t, 150 * pitch, { type: 'sine', gain: vol, decay: 0.12, attack: 0.002, glideTo: 60 });
      hiss(o.c, o.out, t, { gain: vol * 0.4, decay: 0.06, filter: 'lowpass', freq: 900 });
      break;
  }
}

/** Layered blast: a sub drop, a punchy body and crackling debris. */
export function playBoom() {
  const o = fx();
  if (!o) return;
  const t = o.c.currentTime;
  tone(o.c, o.out, t, 90, { type: 'sine', gain: 0.7, decay: 0.7, attack: 0.003, glideTo: 28 });
  hiss(o.c, o.out, t, { gain: 0.55, decay: 0.45, filter: 'lowpass', freq: 2400, sweepTo: 200 });
  for (let i = 0; i < 6; i++) {
    hiss(o.c, o.out, t + 0.05 + Math.random() * 0.4, {
      gain: 0.12,
      decay: 0.03,
      filter: 'bandpass',
      freq: 1500 + Math.random() * 2500,
    });
  }
  duckMusic();
}

/** A soft bell note, used by jingle blocks. */
export function playNote(freq: number) {
  const o = fx();
  if (!o) return;
  fm(o.c, o.out, o.c.currentTime, freq, { ratio: 3.5, index: 1.2, decay: 0.8, gain: 0.3 });
}

export function playVanish() {
  const o = fx();
  if (!o) return;
  const t = o.c.currentTime;
  tone(o.c, o.out, t, 500, { type: 'sine', gain: 0.22, decay: 0.18, glideTo: 1400 });
  hiss(o.c, o.out, t, { gain: 0.15, decay: 0.2, filter: 'highpass', freq: 3000 });
}

/** gem: a two-note chime. point: a coin ping. penalty: a low buzz. rival: a cheeky up-slide. */
export function playScore(kind: 'gem' | 'point' | 'penalty' | 'rival' = 'point') {
  const o = fx();
  if (!o) return;
  const t = o.c.currentTime;
  if (kind === 'gem') {
    fm(o.c, o.out, t, 1319, { ratio: 3.5, index: 1, decay: 0.6, gain: 0.22 });
    fm(o.c, o.out, t + 0.09, 1976, { ratio: 3.5, index: 1, decay: 0.8, gain: 0.2 });
  } else if (kind === 'point') {
    tone(o.c, o.out, t, 988, { type: 'square', gain: 0.12, decay: 0.07, lowpass: 4000 });
    tone(o.c, o.out, t + 0.07, 1319, { type: 'square', gain: 0.12, decay: 0.25, lowpass: 4000 });
  } else if (kind === 'penalty') {
    tone(o.c, o.out, t, 160, { type: 'sawtooth', gain: 0.18, decay: 0.35, glideTo: 110, lowpass: 900 });
  } else {
    tone(o.c, o.out, t, 520, { type: 'triangle', gain: 0.25, decay: 0.25, glideTo: 1200 });
  }
}

/** Short rising zap for the laser tool. */
export function playLaser() {
  const o = fx();
  if (!o) return;
  const t = o.c.currentTime;
  tone(o.c, o.out, t, 1800, { type: 'sawtooth', gain: 0.18, decay: 0.14, glideTo: 300, lowpass: 5000 });
  tone(o.c, o.out, t, 900, { type: 'square', gain: 0.1, decay: 0.1, glideTo: 150 });
}

/** Air rushing past a thrown ball: harder throws are louder, brighter and shorter. */
export function playWhoosh(tier: number) {
  const o = fx();
  if (!o) return;
  hiss(o.c, o.out, o.c.currentTime, {
    gain: 0.08 + tier * 0.05,
    attack: 0.05,
    decay: 0.35 - tier * 0.05,
    filter: 'bandpass',
    freq: 500 + tier * 300,
    sweepTo: 1500 + tier * 900,
    q: 1.5,
  });
}

/** Result jingles: a fanfare for a win, a brighter one with a bell run for gold, a "wah-wah" for a loss. */
export function playStinger(kind: 'win' | 'gold' | 'lose') {
  const o = fx();
  if (!o) return;
  const t = o.c.currentTime;
  duckMusic(0.15, 2.2);
  if (kind === 'lose') {
    for (const [i, m] of [67, 66, 65, 62].entries()) {
      tone(o.c, o.out, t + i * 0.32, midiToHz(m), {
        type: 'sawtooth',
        gain: 0.16,
        decay: i === 3 ? 0.8 : 0.28,
        lowpass: 1100,
        vibrato: i === 3 ? 0.02 : 0,
      });
    }
    return;
  }
  for (const [i, m] of [60, 64, 67, 72].entries()) {
    fm(o.c, o.out, t + i * 0.11, midiToHz(m), { ratio: 4, index: 2, decay: 0.5, gain: 0.3 });
    pluck(o.c, o.out, t + i * 0.11, midiToHz(m - 12), { gain: 0.25, seconds: 0.6 });
  }
  fm(o.c, o.out, t + 0.48, midiToHz(76), { ratio: 3.5, index: 1.5, decay: 1.2, gain: 0.25 });
  if (kind === 'gold') {
    for (const [i, m] of [84, 88, 91, 96].entries()) {
      fm(o.c, o.out, t + 0.7 + i * 0.07, midiToHz(m), { ratio: 3.5, index: 1, decay: 0.7, gain: 0.14 });
    }
  }
}

// ---------- character voices: soft formant blips, not words ----------
export type VoiceLine = 'alert' | 'panic' | 'tumble' | 'cheer' | 'sad' | 'ouch' | 'yelp' | 'whoa' | 'boing';

/** [first formant, second formant] in Hz: the vowel each line is "said" on. */
const VOWELS = { o: [500, 900], i: [300, 2300], a: [750, 1200], e: [450, 1900], u: [350, 800] } as const;

/** Each line: syllables of [start s, length s, pitch from, pitch to] on one vowel. */
const LINES: Record<
  VoiceLine,
  { vowel: keyof typeof VOWELS; syllables: [number, number, number, number][] }
> = {
  alert: { vowel: 'o', syllables: [[0, 0.18, 1, 1.4]] },
  panic: {
    vowel: 'i',
    syllables: [
      [0, 0.08, 1.6, 1.7],
      [0.12, 0.08, 1.6, 1.8],
    ],
  },
  tumble: { vowel: 'a', syllables: [[0, 0.35, 1.5, 0.8]] },
  cheer: {
    vowel: 'e',
    syllables: [
      [0, 0.12, 1.1, 1.3],
      [0.15, 0.18, 1.3, 1.6],
    ],
  },
  sad: { vowel: 'a', syllables: [[0, 0.4, 1, 0.7]] },
  ouch: { vowel: 'u', syllables: [[0, 0.1, 1.2, 0.8]] },
  // funnier hit noises: a squeaky yelp, a sliding "whoa", a rubbery boing
  yelp: {
    vowel: 'i',
    syllables: [
      [0, 0.07, 1.4, 2.2],
      [0.1, 0.07, 1.6, 2.4],
      [0.2, 0.12, 2.2, 1.4],
    ],
  },
  whoa: { vowel: 'o', syllables: [[0, 0.45, 1.8, 0.6]] },
  boing: {
    vowel: 'e',
    syllables: [
      [0, 0.1, 0.8, 1.8],
      [0.12, 0.1, 1.8, 1],
      [0.24, 0.14, 1, 2],
    ],
  },
};

/** A short creature noise; `pitch` scales the voice (small animals squeak higher). */
export function playVoice(line: VoiceLine, pitch: number, delay = 0) {
  const c = out();
  if (!c || !graph || volumes.voices === 0) return;
  const { vowel, syllables } = LINES[line];
  const base = 520 * pitch; // an octave up from before: small, squeaky voices
  for (const [start, len, from, to] of syllables) {
    const at = c.currentTime + delay + start;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * from, at);
    osc.frequency.exponentialRampToValueAtTime(base * to, at + len);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.15, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    for (const f of VOWELS[vowel]) {
      const band = c.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = f * Math.sqrt(pitch); // smaller heads, higher formants
      band.Q.value = 6;
      osc.connect(band).connect(g);
    }
    g.connect(graph.buses.voices);
    osc.start(at);
    osc.stop(at + len + 0.02);
  }
}

let lastCrowd = 0;

/**
 * The crowd around the arena: a staggered chorus of "yay" with a smattering of claps, or an "aww".
 * `big` is for clearing a level: more voices and a longer round of applause than a mid-level cheer.
 */
export function playCrowd(kind: 'cheer' | 'aww', big = false) {
  const c = out();
  if (!c || !graph || volumes.voices === 0) return;
  const now = performance.now();
  if (now - lastCrowd < (big ? 500 : 1500)) return; // one reaction at a time, however many things happen
  lastCrowd = now;
  const voices = big ? 11 : 6;
  for (let i = 0; i < voices; i++) {
    playVoice(kind === 'cheer' ? 'cheer' : 'sad', 0.8 + Math.random() * 1.1, Math.random() * (big ? 0.7 : 0.35));
  }
  if (kind === 'cheer') {
    const claps = big ? 34 : 16;
    const spread = big ? 2.4 : 1.3;
    for (let i = 0; i < claps; i++) {
      hiss(c, graph.buses.voices, c.currentTime + Math.random() * spread, {
        gain: big ? 0.065 : 0.05,
        decay: 0.03,
        filter: 'bandpass',
        freq: 1200 + Math.random() * 1500,
        q: 1.2,
      });
    }
  }
}

// ---------- ambience: a quiet bed of world sounds under the music ----------
let ambienceTheme: ThemeId | null = null;
let ambienceTimer: ReturnType<typeof setInterval> | undefined;

/** One tick of a world's ambience: occasional birds, waves, wind, bells, crickets or an owl. */
function ambienceTick() {
  const o = fx();
  if (!o || !ambienceTheme) return;
  const t = o.c.currentTime;
  const roll = Math.random();
  switch (ambienceTheme) {
    case 'meadow':
      if (roll < 0.35) {
        const f = 2400 + Math.random() * 1200;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
          tone(o.c, o.out, t + i * 0.12, f, { type: 'sine', gain: 0.025, decay: 0.08, glideTo: f * 1.3 });
        }
      }
      break;
    case 'tiki':
      // a wave every few seconds, with a soft hiss of foam
      if (roll < 0.4)
        hiss(o.c, o.out, t, {
          gain: 0.05,
          attack: 1,
          decay: 1.6,
          filter: 'lowpass',
          freq: 500,
          sweepTo: 1400,
        });
      break;
    case 'castle':
      if (roll < 0.3)
        hiss(o.c, o.out, t, {
          gain: 0.03,
          attack: 1.2,
          decay: 1.8,
          filter: 'bandpass',
          freq: 400,
          sweepTo: 900,
          q: 3,
        });
      if (roll > 0.97) fm(o.c, o.out, t, 330, { ratio: 2.76, index: 2, decay: 2.5, gain: 0.04 });
      break;
    case 'gulch':
      if (roll < 0.35)
        hiss(o.c, o.out, t, {
          gain: 0.04,
          attack: 0.8,
          decay: 1.5,
          filter: 'bandpass',
          freq: 700,
          sweepTo: 300,
          q: 2,
        });
      break;
    case 'manor':
      if (roll < 0.5) {
        for (let i = 0; i < 3; i++)
          tone(o.c, o.out, t + i * 0.06, 4400, { type: 'sine', gain: 0.015, decay: 0.03 });
      }
      if (roll > 0.95) {
        tone(o.c, o.out, t, 420, { type: 'sine', gain: 0.05, decay: 0.35, glideTo: 380 });
        tone(o.c, o.out, t + 0.5, 400, { type: 'sine', gain: 0.05, decay: 0.5, glideTo: 340 });
      }
      break;
    case 'pirate':
      // waves against the hull, with an occasional gull cry or creaking rope
      if (roll < 0.4)
        hiss(o.c, o.out, t, {
          gain: 0.05,
          attack: 1,
          decay: 1.7,
          filter: 'lowpass',
          freq: 450,
          sweepTo: 1300,
        });
      else if (roll > 0.92) {
        const f = 1800 + Math.random() * 600;
        tone(o.c, o.out, t, f, { type: 'sine', gain: 0.03, decay: 0.2, glideTo: f * 0.7 });
        tone(o.c, o.out, t + 0.14, f * 0.9, { type: 'sine', gain: 0.025, decay: 0.2, glideTo: f * 0.6 });
      } else if (roll > 0.88) {
        tone(o.c, o.out, t, 220, { type: 'sawtooth', gain: 0.02, decay: 0.3, glideTo: 180 });
      }
      break;
  }
}

/** Switch the ambience to a world (null for silence, e.g. on the title screen). */
export function setAmbience(theme: ThemeId | null) {
  ambienceTheme = theme;
  if (ambienceTimer === undefined) ambienceTimer = setInterval(ambienceTick, 900);
}
