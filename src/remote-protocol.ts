/**
 * The phone remote: the phone sends its tilt (aim) and swipes (throw); the game turns them into the same
 * aim point and flick speed a mouse would give. Messages are small JSON objects over a WebRTC data channel.
 */
export type RemoteMsg =
  | { t: 'identify'; slot: number } // the first thing a phone sends: which player it is (0-based)
  | { t: 'aim'; yaw: number; pitch: number } // degrees away from the calibrated "straight ahead"
  | { t: 'down' } // a finger went down on the phone's pad
  // it came up; `speed` is the swipe speed in px/s, `holdMs` how long the finger was down
  // (a held press with little swipe charges power the way holding Space does on the keyboard)
  | { t: 'up'; speed: number; holdMs: number }
  | { t: 'cmd'; cmd: RemoteCommand } // a button on the phone
  | { t: 'select'; index: number }; // a level picked on the phone

/** Phones can connect as any of these player slots; a hot-seat party has at most this many. */
export const MAX_REMOTE_SLOTS = 4;

export const REMOTE_COMMANDS = ['retry', 'next', 'menu', 'title'] as const;
export type RemoteCommand = (typeof REMOTE_COMMANDS)[number];

/** What the game tells the phone, so its buttons match what is on the big screen. */
export type HostMsg =
  | {
      t: 'state';
      phase: 'title' | 'menu' | 'playing' | 'won' | 'lost';
      /** index of the level being played, -1 on the title and menu */
      level: number;
      name: string;
      throwsLeft: number;
      hasNext: boolean;
      /** swipe speeds (px/s on the phone) where a throw becomes light, medium and full power */
      tiers: [number, number, number];
      /** hot-seat party: how many players and whose turn it is (0-based); solo play is 1 and 0 */
      players: number;
      currentPlayer: number;
    }
  | { t: 'levels'; levels: { name: string; theme: string; medal: 'gold' | 'silver' | 'bronze' | null }[] };

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
  if (m.t === 'identify' && Number.isInteger(m.slot) && (m.slot as number) >= 0 && (m.slot as number) < MAX_REMOTE_SLOTS) {
    return { t: 'identify', slot: m.slot as number };
  }
  if (m.t === 'cmd' && (REMOTE_COMMANDS as readonly unknown[]).includes(m.cmd)) return { t: 'cmd', cmd: m.cmd as RemoteCommand };
  if (m.t === 'select' && Number.isInteger(m.index) && (m.index as number) >= 0 && (m.index as number) < 1000) {
    return { t: 'select', index: m.index as number };
  }
  if (m.t === 'up' && num(m.speed)) {
    return {
      t: 'up',
      speed: Math.max(0, Math.min(20000, m.speed as number)),
      holdMs: num(m.holdMs) ? Math.max(0, Math.min(10000, m.holdMs as number)) : 0,
    };
  }
  return null;
}

/** Check a message from the game (on the phone). */
export function parseHostMsg(data: unknown): HostMsg | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  const phases = ['title', 'menu', 'playing', 'won', 'lost'];
  if (m.t === 'state' && phases.includes(m.phase as string) && typeof m.level === 'number' && typeof m.name === 'string') {
    return {
      t: 'state',
      phase: m.phase as 'title' | 'menu' | 'playing' | 'won' | 'lost',
      level: m.level,
      name: m.name.slice(0, 60),
      throwsLeft: typeof m.throwsLeft === 'number' ? m.throwsLeft : 0,
      hasNext: m.hasNext === true,
      tiers:
        Array.isArray(m.tiers) && m.tiers.length === 3 && m.tiers.every((n) => typeof n === 'number')
          ? (m.tiers as [number, number, number])
          : [1000, 2300, 5400],
      players: typeof m.players === 'number' ? m.players : 1,
      currentPlayer: typeof m.currentPlayer === 'number' ? m.currentPlayer : 0,
    };
  }
  if (m.t === 'levels' && Array.isArray(m.levels)) {
    return {
      t: 'levels',
      levels: m.levels.slice(0, 200).map((l: Record<string, unknown>) => ({
        name: String(l.name ?? '').slice(0, 60),
        theme: String(l.theme ?? ''),
        medal: l.medal === 'gold' || l.medal === 'silver' || l.medal === 'bronze' ? l.medal : null,
      })),
    };
  }
  return null;
}
