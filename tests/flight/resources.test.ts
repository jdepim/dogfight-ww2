import { describe, it, expect } from 'vitest';
import { createResources, consume, tryFire, refuel } from '../../src/flight/resources';
import { createDamage, applyHit } from '../../src/flight/damage';
import { CONFIG } from '../../src/config';

const DT = 1 / 60;
const R = CONFIG.resources;
const loop = (s: number, f: () => void) => { for (let i = 0; i < Math.round(s / DT); i++) f(); };

describe('resources', () => {
  it('empties the tank in fuelSeconds at full throttle', () => {
    const r = createResources(), d = createDamage();
    loop(R.fuelSeconds - 1, () => consume(r, 1, d, DT));
    expect(r.fuel).toBeGreaterThan(0);
    loop(2, () => consume(r, 1, d, DT));
    expect(r.fuel).toBe(0);
  });
  it('burns half as much at half throttle', () => {
    const a = createResources(), b = createResources(), d = createDamage();
    loop(60, () => { consume(a, 1, d, DT); consume(b, 0.5, d, DT); });
    expect(R.fuelSeconds - b.fuel).toBeCloseTo((R.fuelSeconds - a.fuel) / 2, 1);
  });
  it('leaks fuel when the tank is hit', () => {
    const a = createResources(), b = createResources();
    const ok = createDamage(), hit = createDamage(); applyHit(hit, 'tank', 1);
    loop(10, () => { consume(a, 0.5, ok, DT); consume(b, 0.5, hit, DT); });
    expect(b.fuel).toBeLessThan(a.fuel - 1);
  });
  it('fires fireRate rounds per second', () => {
    const r = createResources(); let shots = 0;
    loop(1, () => { if (tryFire(r, DT)) shots++; });
    expect(shots).toBe(R.fireRate);
    expect(r.ammo).toBe(R.ammo - R.fireRate);
  });
  it('cannot fire with no ammo', () => {
    const r = createResources(); r.ammo = 0;
    expect(tryFire(r, DT)).toBe(false);
  });
  it('refuels, rearms and repairs fully in refuelSeconds', () => {
    const r = createResources(), d = createDamage();
    r.fuel = 10; r.ammo = 0; applyHit(d, 'engine', 0.7);
    loop(R.refuelSeconds, () => refuel(r, d, DT));
    expect(r.fuel).toBeCloseTo(R.fuelSeconds, 3);
    expect(r.ammo).toBe(R.ammo);
    expect(d.hp).toBe(100);
    expect(d.zones.engine).toBe(0);
  });
});
