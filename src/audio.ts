/** Synthesised sound effects (no audio files), so there is nothing to license or load. */
export type ImpactKind = 'wood' | 'metal' | 'glass' | 'thud';

const MUTE_KEY = 'blox.muted.v1';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let lastImpact = 0;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

let muted = readMuted();

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

/** Browsers only allow audio after a user gesture; call this from input handlers. */
export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function out(): AudioContext | null {
  return muted || !ctx || ctx.state !== 'running' ? null : ctx;
}

function tone(
  c: AudioContext,
  freq: number,
  endFreq: number,
  dur: number,
  gain: number,
  type: OscillatorType,
) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + dur);
}

function noiseBurst(c: AudioContext, dur: number, gain: number, cutoff: number) {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(80, c.currentTime + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(filter).connect(g).connect(c.destination);
  src.start();
  src.stop(c.currentTime + dur);
}

/** Impact by material; louder with speed, with random pitch so repeats do not sound identical. */
export function playImpact(kind: ImpactKind, speed: number) {
  const c = out();
  if (!c) return;
  const now = performance.now();
  if (now - lastImpact < 35) return; // a collapse fires dozens of contacts at once
  lastImpact = now;
  const vol = Math.min(speed / 12, 1) * 0.35;
  if (vol < 0.02) return;
  const pitch = 0.9 + Math.random() * 0.25;
  switch (kind) {
    case 'wood':
      tone(c, 260 * pitch, 120, 0.09, vol, 'triangle');
      noiseBurst(c, 0.05, vol * 0.5, 2500);
      break;
    case 'metal':
      tone(c, 900 * pitch, 700, 0.25, vol * 0.7, 'sine');
      tone(c, 1330 * pitch, 1000, 0.18, vol * 0.4, 'sine');
      break;
    case 'glass':
      tone(c, 1500 * pitch, 1200, 0.2, vol * 0.5, 'sine');
      break;
    case 'thud':
      tone(c, 150 * pitch, 60, 0.12, vol, 'sine');
      noiseBurst(c, 0.06, vol * 0.4, 900);
      break;
  }
}

export function playBoom() {
  const c = out();
  if (!c) return;
  tone(c, 120, 35, 0.5, 0.6, 'sine');
  noiseBurst(c, 0.45, 0.5, 1800);
}

export function playVanish() {
  const c = out();
  if (!c) return;
  tone(c, 500, 1400, 0.18, 0.25, 'sine');
}

export function playScore(multiplied = false) {
  const c = out();
  if (!c) return;
  tone(c, 660, 660, 0.1, 0.2, 'square');
  setTimeout(() => {
    if (out()) tone(c, multiplied ? 1320 : 880, 880, 0.14, 0.2, 'square');
  }, 80);
}

export function playResult(won: boolean) {
  const c = out();
  if (!c) return;
  const notes = won ? [523, 659, 784, 1047] : [330, 262];
  for (const [i, f] of notes.entries()) {
    setTimeout(() => {
      if (out()) tone(c, f, f, 0.2, 0.25, 'triangle');
    }, i * 120);
  }
}
