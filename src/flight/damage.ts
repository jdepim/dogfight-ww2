import * as THREE from 'three';
import { CONFIG } from '../config';
import type { ControlModifiers } from './flightModel';

export type Zone = 'engine' | 'wingL' | 'wingR' | 'tail' | 'tank';
export const ZONES: readonly Zone[] = ['engine', 'wingL', 'wingR', 'tail', 'tank'];

export interface DamageState {
  /** 0..1, 1 = destroyed */
  zones: Record<Zone, number>;
  /** 0..100 */
  hp: number;
}

export function createDamage(): DamageState {
  return { zones: { engine: 0, wingL: 0, wingR: 0, tail: 0, tank: 0 }, hp: 100 };
}

export function applyHit(d: DamageState, zone: Zone, amount: number): void {
  d.zones[zone] = Math.min(1, d.zones[zone] + amount);
  d.hp = Math.max(0, d.hp - amount * CONFIG.damage.hpPerUnit);
}

export function isDestroyed(d: DamageState): boolean {
  return d.hp <= 0 || d.zones.wingL >= 1 || d.zones.wingR >= 1;
}

export function modifiersFrom(d: DamageState): ControlModifiers {
  const D = CONFIG.damage;
  return {
    thrustFactor: 1 - D.engineThrustLoss * d.zones.engine,
    controlFactor: 1 - D.tailControlLoss * d.zones.tail,
    rollBias: D.wingRollBias * (d.zones.wingR - d.zones.wingL),
  };
}

/** Repair a fraction (0..1) of full damage. */
export function repair(d: DamageState, fraction: number): void {
  for (const z of ZONES) d.zones[z] = Math.max(0, d.zones[z] - fraction);
  d.hp = Math.min(100, d.hp + 100 * fraction);
}

/** Map an impact point in plane-local metres (−Z forward) to a zone. */
export function zoneFromLocalHit(local: THREE.Vector3): Zone {
  if (local.x < -2) return 'wingL';
  if (local.x > 2) return 'wingR';
  if (local.z < -3) return 'engine';
  if (local.z > 4) return 'tail';
  return 'tank';
}
