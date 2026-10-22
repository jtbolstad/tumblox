import { betterMedal, type Medal } from './rules';

export interface LevelProgress {
  best: number;
  medal: Medal | null;
}

const KEY = 'blox.progress.v1';

export function loadProgress(): Record<string, LevelProgress> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, LevelProgress>) : {};
  } catch {
    return {}; // storage blocked or corrupt: play without saved medals
  }
}

/** Merge a finished run into saved progress, keeping the best score and medal. */
export function recordResult(levelId: string, score: number, medal: Medal | null): LevelProgress {
  const all = loadProgress();
  const prev = all[levelId];
  const next: LevelProgress = {
    best: Math.max(prev?.best ?? 0, score),
    medal: betterMedal(prev?.medal ?? null, medal),
  };
  all[levelId] = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore: progress just isn't saved
  }
  return next;
}
