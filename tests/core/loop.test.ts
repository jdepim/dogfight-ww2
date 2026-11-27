import { describe, it, expect } from 'vitest';
import { FixedLoop } from '../../src/core/loop';

const STEP = 1 / 60;

function make() {
  const alphas: number[] = [];
  let steps = 0;
  const loop = new FixedLoop(STEP, 0.25, () => { steps++; }, (a) => alphas.push(a));
  return { loop, alphas, steps: () => steps };
}

describe('FixedLoop', () => {
  it('runs one step for one step of real time', () => {
    const { loop } = make();
    expect(loop.advance(STEP)).toBe(1);
  });

  it('accumulates remainders across frames', () => {
    const { loop, steps } = make();
    expect(loop.advance(0.05)).toBe(3);
    loop.advance(0.05);
    expect(steps()).toBe(6);
  });

  it('clamps huge frame times (hidden tab) to maxFrame', () => {
    const { loop } = make();
    expect(loop.advance(10)).toBeLessThanOrEqual(Math.ceil(0.25 / STEP));
  });

  it('passes an interpolation alpha in [0,1)', () => {
    const { loop, alphas } = make();
    loop.advance(0.025);
    loop.advance(0.013);
    expect(alphas.length).toBe(2);
    for (const a of alphas) { expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThan(1); }
  });
});
