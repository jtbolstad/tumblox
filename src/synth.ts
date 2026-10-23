/**
 * Sample-free instruments on Web Audio, shared by the music and the sound effects.
 * Every function schedules one note at `when` into `out` and cleans up after itself.
 */

let noiseBuffer: AudioBuffer | null = null;

function noise(c: BaseAudioContext): AudioBuffer {
  if (!noiseBuffer || noiseBuffer.sampleRate !== c.sampleRate) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function envelope(c: BaseAudioContext, when: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
  return g;
}

export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/**
 * FM tone: a sine carrier bent by a sine modulator whose depth decays fast, so the attack is bright
 * and the tail is pure. ratio 4 ≈ marimba, 3.5 ≈ bell, 2.76 ≈ metal, 1.5 ≈ log drum.
 */
export function fm(
  c: BaseAudioContext,
  out: AudioNode,
  when: number,
  freq: number,
  opts: { ratio: number; index: number; decay: number; gain: number; attack?: number },
) {
  const carrier = c.createOscillator();
  const mod = c.createOscillator();
  const modGain = c.createGain();
  carrier.frequency.value = freq;
  mod.frequency.value = freq * opts.ratio;
  modGain.gain.setValueAtTime(freq * opts.index, when);
  modGain.gain.exponentialRampToValueAtTime(Math.max(freq * 0.01, 0.01), when + opts.decay * 0.4);
  mod.connect(modGain).connect(carrier.frequency);
  const amp = envelope(c, when, opts.gain, opts.attack ?? 0.004, opts.decay);
  carrier.connect(amp).connect(out);
  const end = when + (opts.attack ?? 0.004) + opts.decay + 0.05;
  for (const o of [carrier, mod]) {
    o.start(when);
    o.stop(end);
  }
}

const pluckCache = new Map<string, AudioBuffer>();

/**
 * Karplus-Strong plucked string: a noise burst circulating through a short averaging delay line.
 * `damping` near 0.5 = bright and long (harpsichord, banjo), lower = dull and short (wood clack).
 * Buffers are cached per pitch, so a looping melody costs nothing after the first pass.
 */
export function pluck(
  c: BaseAudioContext,
  out: AudioNode,
  when: number,
  freq: number,
  opts: { gain: number; seconds: number; damping?: number; bright?: number },
) {
  const damping = opts.damping ?? 0.498;
  const key = `${Math.round(freq * 10)}:${opts.seconds}:${damping}:${opts.bright ?? 1}:${c.sampleRate}`;
  let buffer = pluckCache.get(key);
  if (!buffer) {
    const length = Math.ceil(c.sampleRate * opts.seconds);
    buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    const period = Math.max(2, Math.round(c.sampleRate / freq));
    const line = new Float32Array(period);
    let last = 0;
    for (let i = 0; i < period; i++) {
      // a brighter pluck starts from rawer noise; a softer one from pre-smoothed noise
      const n = Math.random() - 0.5; // half scale: chords of plucks must not clip
      last = last + (n - last) * (opts.bright ?? 1);
      line[i] = last;
    }
    for (let i = 0; i < length; i++) {
      const j = i % period;
      const next = line[(j + 1) % period];
      const v = line[j];
      data[i] = v;
      line[j] = (v + next) * damping;
    }
    pluckCache.set(key, buffer);
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  g.gain.setValueAtTime(opts.gain, when);
  g.gain.setValueAtTime(opts.gain, when + opts.seconds * 0.8);
  g.gain.linearRampToValueAtTime(0, when + opts.seconds);
  src.connect(g).connect(out);
  src.start(when);
}

/** A plain oscillator note with an envelope, optional pitch glide and vibrato (flute, theremin, tuba). */
export function tone(
  c: BaseAudioContext,
  out: AudioNode,
  when: number,
  freq: number,
  opts: {
    type: OscillatorType;
    gain: number;
    decay: number;
    attack?: number;
    glideTo?: number;
    vibrato?: number;
    lowpass?: number;
  },
) {
  const osc = c.createOscillator();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(freq, when);
  const attack = opts.attack ?? 0.01;
  if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(opts.glideTo, when + attack + opts.decay);
  const nodes: AudioScheduledSourceNode[] = [osc];
  if (opts.vibrato) {
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.value = freq * opts.vibrato;
    lfo.connect(depth).connect(osc.frequency);
    nodes.push(lfo);
  }
  const amp = envelope(c, when, opts.gain, attack, opts.decay);
  if (opts.lowpass) {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = opts.lowpass;
    osc.connect(lp).connect(amp);
  } else {
    osc.connect(amp);
  }
  amp.connect(out);
  for (const n of nodes) {
    n.start(when);
    n.stop(when + attack + opts.decay + 0.05);
  }
}

/** Filtered noise: shakers, hats, snares, whooshes, crackle. `sweepTo` slides the filter. */
export function hiss(
  c: BaseAudioContext,
  out: AudioNode,
  when: number,
  opts: {
    gain: number;
    decay: number;
    filter: BiquadFilterType;
    freq: number;
    sweepTo?: number;
    attack?: number;
    q?: number;
  },
) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = opts.filter;
  f.frequency.setValueAtTime(opts.freq, when);
  if (opts.sweepTo)
    f.frequency.exponentialRampToValueAtTime(opts.sweepTo, when + (opts.attack ?? 0.002) + opts.decay);
  f.Q.value = opts.q ?? 0.8;
  const amp = envelope(c, when, opts.gain, opts.attack ?? 0.002, opts.decay);
  src.connect(f).connect(amp).connect(out);
  src.start(when, Math.random() * 0.5);
  src.stop(when + (opts.attack ?? 0.002) + opts.decay + 0.05);
}

/** Kick: a sine that drops in pitch fast. */
export function kick(c: BaseAudioContext, out: AudioNode, when: number, gain: number) {
  tone(c, out, when, 140, { type: 'sine', gain, decay: 0.22, attack: 0.002, glideTo: 42 });
}

/** A short reverb tail from decaying stereo noise, so nothing needs to be loaded. */
export function makeReverb(c: BaseAudioContext, seconds = 1.8): ConvolverNode {
  const length = Math.ceil(c.sampleRate * seconds);
  const ir = c.createBuffer(2, length, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  return conv;
}
