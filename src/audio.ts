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

/** The running audio context, or null while muted or not yet unlocked. Used by the music scheduler. */
export function audioContext(): AudioContext | null {
  return out();
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

/** A soft bell note, used by jingle blocks. */
export function playNote(freq: number) {
  const c = out();
  if (!c) return;
  tone(c, freq, freq, 0.45, 0.28, 'sine');
  tone(c, freq * 2, freq * 2, 0.25, 0.1, 'sine');
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

/** Short rising zap for the laser tool. */
export function playLaser() {
  const c = out();
  if (!c) return;
  tone(c, 1800, 300, 0.14, 0.2, 'sawtooth');
  tone(c, 900, 150, 0.1, 0.12, 'square');
}

// ---------- character voices: soft formant blips, not words ----------
export type VoiceLine = 'alert' | 'panic' | 'tumble' | 'cheer' | 'sad' | 'ouch';

const VOICE_KEY = 'blox.voices.v1';
let voicesOn = readVoicesOn();

function readVoicesOn(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function areVoicesOn() {
  return voicesOn;
}

export function setVoicesOn(value: boolean) {
  voicesOn = value;
  try {
    localStorage.setItem(VOICE_KEY, value ? '1' : '0');
  } catch {
    // ignore: the choice just is not remembered
  }
}

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
};

/** A short creature noise; `pitch` scales the voice (small animals squeak higher). */
export function playVoice(line: VoiceLine, pitch: number) {
  const c = out();
  if (!c || !voicesOn) return;
  const { vowel, syllables } = LINES[line];
  const base = 260 * pitch;
  for (const [start, len, from, to] of syllables) {
    const at = c.currentTime + start;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * from, at);
    osc.frequency.exponentialRampToValueAtTime(base * to, at + len);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    for (const f of VOWELS[vowel]) {
      const band = c.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = f * Math.sqrt(pitch); // smaller heads, higher formants
      band.Q.value = 6;
      osc.connect(band).connect(g);
    }
    g.connect(c.destination);
    osc.start(at);
    osc.stop(at + len + 0.02);
  }
}
