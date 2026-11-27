export interface ScoreState {
  kills: number;
  shots: number;
  hits: number;
  points: number;
  nonStopWaves: number;
}

const KEY = 'dogfight-ww2.best';

export function createScore(): ScoreState {
  return { kills: 0, shots: 0, hits: 0, points: 0, nonStopWaves: 0 };
}

function defaultStorage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function loadBest(storage: Storage | undefined = defaultStorage()): number {
  try {
    const v = Number(storage?.getItem(KEY) ?? 0);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/** Returns true when `points` is a new record. Never throws. */
export function saveBest(points: number, storage: Storage | undefined = defaultStorage()): boolean {
  if (points <= loadBest(storage)) return false;
  try { storage?.setItem(KEY, String(points)); } catch { /* storage unavailable: record not persisted */ }
  return true;
}
