import { describe, expect, it } from 'vitest';
import { AIM_RANGE_DEG, aimToScreen, parseRemoteMsg, wrapDeg } from './remote-protocol';

describe('wrapDeg', () => {
  it('folds angles into -180..180', () => {
    expect(wrapDeg(190)).toBe(-170);
    expect(wrapDeg(-190)).toBe(170);
    expect(wrapDeg(360)).toBe(0);
    expect(wrapDeg(180)).toBe(180);
  });
});

describe('aimToScreen', () => {
  it('points at the middle when straight ahead', () => {
    expect(aimToScreen(0, 0, 1000, 600)).toEqual({ x: 500, y: 300 });
  });

  it('turning left moves the aim left and raising the tip moves it up', () => {
    const p = aimToScreen(AIM_RANGE_DEG.x / 2, AIM_RANGE_DEG.y / 2, 1000, 600);
    expect(p.x).toBeLessThan(500);
    expect(p.y).toBeLessThan(300);
  });

  it('stays on the screen however far the phone turns', () => {
    const p = aimToScreen(-170, 80, 1000, 600);
    expect(p).toEqual({ x: 1000, y: 0 });
  });
});

describe('parseRemoteMsg', () => {
  it('accepts the three message kinds and clamps numbers', () => {
    expect(parseRemoteMsg({ t: 'aim', yaw: 10, pitch: -5 })).toEqual({ t: 'aim', yaw: 10, pitch: -5 });
    expect(parseRemoteMsg({ t: 'down' })).toEqual({ t: 'down' });
    expect(parseRemoteMsg({ t: 'up', speed: 99999 })).toEqual({ t: 'up', speed: 20000, holdMs: 0 });
    expect(parseRemoteMsg({ t: 'up', speed: 0, holdMs: 99999 })).toEqual({
      t: 'up',
      speed: 0,
      holdMs: 10000,
    });
  });

  it('rejects junk', () => {
    expect(parseRemoteMsg(null)).toBeNull();
    expect(parseRemoteMsg('aim')).toBeNull();
    expect(parseRemoteMsg({ t: 'aim', yaw: 'x', pitch: 1 })).toBeNull();
    expect(parseRemoteMsg({ t: 'boom' })).toBeNull();
    expect(parseRemoteMsg({ t: 'up', speed: Number.NaN })).toBeNull();
  });
});
