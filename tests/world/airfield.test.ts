import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { checkTouchdown, gearDown, inRefuelZone } from '../../src/world/airfield';
import { generateWorld } from '../../src/world/cityGen';
import { createFlightState, forwardOf } from '../../src/flight/flightModel';
import { CONFIG } from '../../src/config';

const rw = () => generateWorld(CONFIG.world.seed).runway;

function approach(opts: { speed?: number; sink?: number; rollDeg?: number; headingOffDeg?: number; offset?: number; y?: number } = {}) {
  const r = rw();
  const { speed = 50, sink = 2, rollDeg = 5, headingOffDeg = 10, offset = 0, y = CONFIG.flight.groundClearance } = opts;
  const s = createFlightState(new THREE.Vector3(r.center.x + offset, y, r.center.z), r.headingRad + (headingOffDeg * Math.PI) / 180, false);
  s.orientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (-rollDeg * Math.PI) / 180));
  s.velocity.copy(forwardOf(s)).multiplyScalar(speed);
  s.velocity.y = -sink;
  s.speed = speed;
  return { s, r };
}

describe('checkTouchdown', () => {
  it('is airborne above the ground', () => {
    const { s, r } = approach({ y: 20 });
    expect(checkTouchdown(s, r, 1).result).toBe('airborne');
  });
  it('is airborne when climbing away at runway height', () => {
    const { s, r } = approach({ speed: 80, sink: -2 });
    expect(checkTouchdown(s, r, 1).result).toBe('airborne');
  });
  it('is not airborne when well below runway height, even climbing', () => {
    const { s, r } = approach({ speed: 80, sink: -2, y: 0.5 });
    expect(checkTouchdown(s, r, 1).result).toBe('crash');
  });
  it('lands within tolerances', () => {
    const { s, r } = approach();
    expect(checkTouchdown(s, r, 1)).toEqual({ result: 'landed' });
  });
  it('accepts landing in the opposite direction', () => {
    const { s, r } = approach({ headingOffDeg: 180 + 5 });
    expect(checkTouchdown(s, r, 1).result).toBe('landed');
  });
  it('crashes when too fast', () => {
    const { s, r } = approach({ speed: 70 });
    expect(checkTouchdown(s, r, 1)).toEqual({ result: 'crash', reason: 'Trop rapide' });
  });
  it('crashes when sinking too hard', () => {
    const { s, r } = approach({ sink: 6 });
    expect(checkTouchdown(s, r, 1)).toEqual({ result: 'crash', reason: 'Atterrissage trop brutal' });
  });
  it('crashes when banked', () => {
    const { s, r } = approach({ rollDeg: 20 });
    expect(checkTouchdown(s, r, 1)).toEqual({ result: 'crash', reason: 'Ailes pas à plat' });
  });
  it('crashes when misaligned', () => {
    const { s, r } = approach({ headingOffDeg: 30 });
    expect(checkTouchdown(s, r, 1)).toEqual({ result: 'crash', reason: 'Mauvais alignement' });
  });
  it('crashes off the runway', () => {
    const { s, r } = approach({ offset: 200 });
    expect(checkTouchdown(s, r, 1)).toEqual({ result: 'crash', reason: 'Hors piste' });
  });
  it('crashes on a destroyed runway', () => {
    const { s, r } = approach();
    r.destroyedUntilWave = 3;
    expect(checkTouchdown(s, r, 3)).toEqual({ result: 'crash', reason: 'Piste détruite' });
    expect(checkTouchdown(s, r, 4).result).toBe('landed');
  });
});

describe('gear and refuel zone', () => {
  it('lowers gear low, slow and near the runway', () => {
    const { s, r } = approach({ y: 40, speed: 60 });
    expect(gearDown(s, r)).toBe(true);
    s.speed = 100;
    expect(gearDown(s, r)).toBe(false);
  });
  it('raises gear far from the runway', () => {
    const { s, r } = approach({ y: 40, speed: 60, offset: 1600 });
    expect(gearDown(s, r)).toBe(false);
  });
  it('detects the refuel zone only on the ground', () => {
    const { s, r } = approach();
    s.onGround = true;
    expect(inRefuelZone(s, r)).toBe(true);
    s.onGround = false;
    expect(inRefuelZone(s, r)).toBe(false);
  });
});
