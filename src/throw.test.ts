import { describe, expect, it } from 'vitest';
import { chargeTier, powerTier, releaseVelocity } from './throw';

describe('releaseVelocity', () => {
  it('is zero for a tap', () => {
    expect(releaseVelocity([{ t: 0, x: 5, y: 5 }]).speed).toBe(0);
  });

  it('uses only the last 80 ms', () => {
    const f = releaseVelocity([
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 0, y: -500 }, // slow early, ignored
      { t: 140, x: 0, y: -520 },
      { t: 180, x: 0, y: -600 },
    ]);
    // 100ms->180ms window starts at t=100: 100px in 80ms = 1250 px/s
    expect(f.vy).toBeCloseTo(-1250, 0);
    expect(f.speed).toBeCloseTo(1250, 0);
  });
});

describe('powerTier', () => {
  const th = [300, 900, 1800] as const;
  it('snaps to 4 tiers', () => {
    expect(powerTier(0, th)).toBe(0);
    expect(powerTier(299, th)).toBe(0);
    expect(powerTier(300, th)).toBe(1);
    expect(powerTier(1000, th)).toBe(2);
    expect(powerTier(5000, th)).toBe(3);
  });
});

describe('chargeTier', () => {
  it('ping-pongs through the four tiers', () => {
    const tiers = [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4].map((t) => chargeTier(t));
    expect(tiers).toEqual([0, 1, 2, 3, 2, 1, 0]);
  });
});
