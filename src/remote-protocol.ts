/**
 * The phone remote: the phone sends its tilt (aim) and swipes (throw); the game turns them into the same
 * aim point and flick speed a mouse would give. Messages are small JSON objects over a WebRTC data channel.
 */
export type RemoteMsg =
  | { t: 'aim'; yaw: number; pitch: number } // degrees away from the calibrated "straight ahead"
  | { t: 'down' } // a finger went down on the phone's pad
  | { t: 'up'; speed: number }; // it came up; `speed` is the swipe speed in px/s

/** How far the phone turns (degrees) to sweep the aim across the whole screen, each way. */
export const AIM_RANGE_DEG = { x: 30, y: 18 };

/** Phone swipe speeds are scaled to match the flick speeds the throw tiers were tuned on. */
export const REMOTE_SPEED_SCALE = 1.3;

/** An angle in degrees folded into (-180, 180]. */
export function wrapDeg(d: number): number {
  const r = ((((d + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
}

/** Tilt away from straight ahead to a point on the screen (pixels); clamped to the screen. */
export function aimToScreen(yaw: number, pitch: number, width: number, height: number) {
  const nx = Math.max(-1, Math.min(1, yaw / AIM_RANGE_DEG.x));
  const ny = Math.max(-1, Math.min(1, pitch / AIM_RANGE_DEG.y));
  // turning left (positive yaw) moves the aim left; raising the tip (positive pitch) moves it up
  return { x: (0.5 - nx / 2) * width, y: (0.5 - ny / 2) * height };
}

/** Check an incoming message; anything unexpected is ignored rather than trusted. */
export function parseRemoteMsg(data: unknown): RemoteMsg | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (m.t === 'aim' && num(m.yaw) && num(m.pitch)) {
    return { t: 'aim', yaw: Math.max(-180, Math.min(180, m.yaw as number)), pitch: Math.max(-90, Math.min(90, m.pitch as number)) };
  }
  if (m.t === 'down') return { t: 'down' };
  if (m.t === 'up' && num(m.speed)) return { t: 'up', speed: Math.max(0, Math.min(20000, m.speed as number)) };
  return null;
}
