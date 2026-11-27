import { describe, it, expect } from 'vitest';
import { mapMouse, mapJoystick, throttleDeltaTowards } from '../../src/input/mapping';

describe('mapJoystick', () => {
  it('is zero inside the dead zone', () => {
    expect(mapJoystick(5, -5, 100, 0.12)).toEqual({ pitch: 0, roll: 0 });
  });
  it('reaches ±1 at the rim', () => {
    const r = mapJoystick(100, 0, 100, 0.12);
    expect(r.roll).toBeCloseTo(1, 5);
    expect(mapJoystick(0, 100, 100, 0.12).pitch).toBeCloseTo(1, 5);
  });
  it('clamps beyond the rim', () => {
    const r = mapJoystick(300, 0, 100, 0.12);
    expect(r.roll).toBeCloseTo(1, 5);
  });
  it('pulling the stick down (towards you) pitches up', () => {
    expect(mapJoystick(0, 80, 100, 0.12).pitch).toBeGreaterThan(0);
    expect(mapJoystick(0, -80, 100, 0.12).pitch).toBeLessThan(0);
  });
});

describe('mapMouse', () => {
  it('clamps large movements to ±1', () => {
    const r = mapMouse(10000, -10000, 0.004, false);
    expect(r.roll).toBe(1);
    expect(r.pitch).toBe(-1);
  });
  it('moving the mouse towards you (dy > 0) pitches up by default', () => {
    expect(mapMouse(0, 50, 0.004, false).pitch).toBeGreaterThan(0);
  });
  it('invertY flips pitch', () => {
    expect(mapMouse(0, 50, 0.004, true).pitch).toBeLessThan(0);
  });
});

describe('throttleDeltaTowards', () => {
  it('pushes towards the slider target and stops when reached', () => {
    expect(throttleDeltaTowards(0.8, 0.2)).toBeGreaterThan(0);
    expect(throttleDeltaTowards(0.2, 0.8)).toBeLessThan(0);
    expect(throttleDeltaTowards(0.5, 0.5)).toBe(0);
    expect(Math.abs(throttleDeltaTowards(1, 0))).toBeLessThanOrEqual(1);
  });
});
