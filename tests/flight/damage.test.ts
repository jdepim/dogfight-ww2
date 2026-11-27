import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createDamage, applyHit, isDestroyed, modifiersFrom, repair, zoneFromLocalHit } from '../../src/flight/damage';

describe('damage', () => {
  it('engine damage reduces thrust', () => {
    const d = createDamage();
    applyHit(d, 'engine', 0.5);
    expect(modifiersFrom(d).thrustFactor).toBeLessThan(1);
  });
  it('left wing damage rolls left, right wing rolls right', () => {
    const l = createDamage(); applyHit(l, 'wingL', 0.5);
    const r = createDamage(); applyHit(r, 'wingR', 0.5);
    expect(modifiersFrom(l).rollBias).toBeLessThan(0);
    expect(modifiersFrom(r).rollBias).toBeGreaterThan(0);
  });
  it('tail damage reduces control authority', () => {
    const d = createDamage(); applyHit(d, 'tail', 0.6);
    expect(modifiersFrom(d).controlFactor).toBeLessThan(1);
  });
  it('is neutral when undamaged', () => {
    expect(modifiersFrom(createDamage())).toEqual({ thrustFactor: 1, controlFactor: 1, rollBias: 0 });
  });
  it('is destroyed when hp reaches 0', () => {
    const d = createDamage();
    for (let i = 0; i < 20; i++) applyHit(d, 'tank', 0.3);
    expect(d.hp).toBe(0);
    expect(isDestroyed(d)).toBe(true);
  });
  it('is destroyed when a wing is destroyed', () => {
    const d = createDamage(); applyHit(d, 'wingR', 1);
    expect(isDestroyed(d)).toBe(true);
  });
  it('repair restores zones and hp', () => {
    const d = createDamage(); applyHit(d, 'engine', 0.6); repair(d, 1);
    expect(d.zones.engine).toBe(0); expect(d.hp).toBe(100);
  });
  it('maps local hit points to zones', () => {
    expect(zoneFromLocalHit(new THREE.Vector3(-3, 0, 0))).toBe('wingL');
    expect(zoneFromLocalHit(new THREE.Vector3(3, 0, 0))).toBe('wingR');
    expect(zoneFromLocalHit(new THREE.Vector3(0, 0, -4))).toBe('engine');
    expect(zoneFromLocalHit(new THREE.Vector3(0, 0, 5))).toBe('tail');
    expect(zoneFromLocalHit(new THREE.Vector3(0, 0, 0))).toBe('tank');
  });
});
