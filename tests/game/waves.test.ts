import { describe, it, expect } from 'vitest';
import { waveComposition } from '../../src/game/waves';

describe('waveComposition', () => {
  it('wave 1: 2 fighters, skill 0.28, no bombers', () => {
    const w = waveComposition(1);
    expect(w.fighters).toBe(2);
    expect(w.skill).toBeCloseTo(0.28, 5);
    expect(w.bombers).toBe(0);
    expect(w.escorts).toBe(0);
  });
  it('wave 4: no bombers', () => expect(waveComposition(4).bombers).toBe(0));
  it('wave 5: 1 bomber + 2 escorts', () => {
    const w = waveComposition(5);
    expect(w.bombers).toBe(1);
    expect(w.escorts).toBe(2);
  });
  it('wave 10: fighters capped at 8, 2 bombers + 2 escorts, skill capped at 1', () => {
    const w = waveComposition(10);
    expect(w.fighters).toBe(8);
    expect(w.bombers).toBe(2);
    expect(w.escorts).toBe(2);
    expect(waveComposition(20).skill).toBe(1);
  });
});
