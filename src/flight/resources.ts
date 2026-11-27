import { CONFIG } from '../config';
import { repair, type DamageState } from './damage';

export interface Resources {
  /** seconds of full-throttle flight left */
  fuel: number;
  ammo: number;
  fireCooldown: number;
}

export function createResources(): Resources {
  return { fuel: CONFIG.resources.fuelSeconds, ammo: CONFIG.resources.ammo, fireCooldown: 0 };
}

export function consume(r: Resources, throttle: number, d: DamageState, dt: number): void {
  const burn = throttle + CONFIG.damage.tankLeak * d.zones.tank;
  r.fuel = Math.max(0, r.fuel - burn * dt);
}

/** Advance the gun cooldown without firing. */
export function tickGun(r: Resources, dt: number): void {
  r.fireCooldown = Math.max(0, r.fireCooldown - dt);
}

/** Call every step while the trigger is held; returns true when a round leaves the gun. */
export function tryFire(r: Resources, dt: number): boolean {
  r.fireCooldown -= dt;
  if (r.fireCooldown > 1e-6 || r.ammo <= 0) {
    if (r.fireCooldown < 0) r.fireCooldown = 0;
    return false;
  }
  r.ammo -= 1;
  r.fireCooldown = Math.max(0, r.fireCooldown) + 1 / CONFIG.resources.fireRate;
  return true;
}

/** Progressive refuel/rearm/repair; full after CONFIG.resources.refuelSeconds. */
export function refuel(r: Resources, d: DamageState, dt: number): void {
  const R = CONFIG.resources;
  const k = dt / R.refuelSeconds;
  r.fuel = Math.min(R.fuelSeconds, r.fuel + R.fuelSeconds * k);
  r.ammo = Math.min(R.ammo, r.ammo + R.ammo * k);
  if (R.ammo - r.ammo < 1e-6) r.ammo = R.ammo;
  repair(d, k);
  if (100 - d.hp < 1e-6) d.hp = 100;
}
