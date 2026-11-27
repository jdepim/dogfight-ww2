import { describe, it, expect } from 'vitest';
import { engineParams } from '../../src/audio/sfx';

describe('engineParams', () => {
  it('raises pitch with throttle', () => {
    expect(engineParams(1, false, 0).freq).toBeGreaterThan(engineParams(0, false, 0).freq);
  });
  it('is steady when healthy', () => {
    const a = engineParams(0.5, false, 0.1).gain, b = engineParams(0.5, false, 0.37).gain;
    expect(a).toBeCloseTo(b, 6);
  });
  it('sputters when damaged', () => {
    const gains = Array.from({ length: 50 }, (_, i) => engineParams(0.5, true, i * 0.07).gain);
    expect(Math.max(...gains) - Math.min(...gains)).toBeGreaterThan(0.02);
  });
});
