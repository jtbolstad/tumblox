export interface PointerSample {
  t: number; // ms
  x: number; // css px
  y: number;
}

export interface Flick {
  vx: number; // px/s
  vy: number;
  speed: number;
}

/** Pointer velocity over the last `windowMs` of samples ending at the newest one. */
export function releaseVelocity(samples: PointerSample[], windowMs = 80): Flick {
  const none = { vx: 0, vy: 0, speed: 0 };
  if (samples.length < 2) return none;
  const last = samples[samples.length - 1];
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > windowMs) break;
    first = samples[i];
  }
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return none;
  const vx = (last.x - first.x) / dt;
  const vy = (last.y - first.y) / dt;
  return { vx, vy, speed: Math.hypot(vx, vy) };
}

/**
 * Snap a flick speed (px/s) to one of 4 power tiers (0 = tap .. 3 = full).
 * `thresholds` are the lower bounds of tiers 1, 2 and 3.
 */
export function powerTier(speed: number, thresholds: readonly [number, number, number]): 0 | 1 | 2 | 3 {
  if (speed >= thresholds[2]) return 3;
  if (speed >= thresholds[1]) return 2;
  if (speed >= thresholds[0]) return 1;
  return 0;
}

/**
 * One-button throw: while the key is held the power ping-pongs 0,1,2,3,2,1,0... and the tier at
 * release is used. `seconds` is how long the key has been held.
 */
export function chargeTier(seconds: number, secondsPerStep = 0.4): 0 | 1 | 2 | 3 {
  const sequence = [0, 1, 2, 3, 2, 1] as const;
  return sequence[Math.floor(Math.max(seconds, 0) / secondsPerStep + 1e-9) % sequence.length];
}
