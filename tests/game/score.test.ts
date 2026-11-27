import { describe, it, expect } from 'vitest';
import { loadBest, saveBest } from '../../src/game/score';

function memStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } } as Storage;
}
const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as unknown as Storage;

describe('best score', () => {
  it('saves a record and reads it back', () => {
    const s = memStorage();
    expect(loadBest(s)).toBe(0);
    expect(saveBest(500, s)).toBe(true);
    expect(loadBest(s)).toBe(500);
    expect(saveBest(300, s)).toBe(false);
    expect(loadBest(s)).toBe(500);
  });
  it('survives an unavailable storage', () => {
    expect(loadBest(broken)).toBe(0);
    expect(() => saveBest(100, broken)).not.toThrow();
    expect(loadBest(undefined)).toBe(0);
  });
});
