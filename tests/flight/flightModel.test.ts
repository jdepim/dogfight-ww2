import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createFlightState, stepFlight, forwardOf, NEUTRAL_MODS } from '../../src/flight/flightModel';
import { NEUTRAL_INPUT, type FlightInput } from '../../src/input/types';
import { CONFIG } from '../../src/config';

const DT = 1 / 60;
const F = CONFIG.flight;

function airborne(speed: number, throttle = 0.7) {
  const s = createFlightState(new THREE.Vector3(0, 500, 0), 0, false);
  s.velocity.copy(forwardOf(s)).multiplyScalar(speed);
  s.speed = speed;
  s.throttle = throttle;
  return s;
}

function run(s: ReturnType<typeof airborne>, seconds: number, input: Partial<FlightInput> = {}, mods = NEUTRAL_MODS, fuel = true) {
  const inp = { ...NEUTRAL_INPUT, ...input };
  for (let t = 0; t < seconds; t += DT) stepFlight(s, inp, mods, fuel, DT);
}

describe('stepFlight', () => {
  it('holds altitude in level flight at cruise speed', () => {
    const s = airborne(F.cruiseSpeed);
    run(s, 5);
    expect(Math.abs(s.position.y - 500)).toBeLessThan(15);
    expect(s.stalled).toBe(false);
  });

  it('decelerates with throttle at zero', () => {
    const s = airborne(F.cruiseSpeed, 0);
    run(s, 3);
    expect(s.speed).toBeLessThan(F.cruiseSpeed - 5);
  });

  it('stalls below stall speed and the nose drops', () => {
    const s = airborne(30, 0);
    const before = forwardOf(s).y;
    run(s, 1);
    expect(s.stalled).toBe(true);
    expect(forwardOf(s).y).toBeLessThan(before - 0.05);
  });

  it('limits roll rate', () => {
    const s = airborne(F.cruiseSpeed);
    run(s, 1, { roll: 1 });
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orientation);
    const bank = Math.atan2(-right.y, Math.hypot(right.x, right.z));
    expect(bank).toBeGreaterThan(0.5);
    // Rotation applied over 1 s cannot exceed rollRate (allow wrap past 90°: check via quaternion angle)
    const angle = 2 * Math.acos(Math.min(1, Math.abs(s.orientation.w)));
    expect(angle).toBeLessThanOrEqual(F.rollRate + 0.05);
  });

  it('produces no thrust without fuel', () => {
    const s = airborne(F.cruiseSpeed, 1);
    run(s, 3, {}, NEUTRAL_MODS, false);
    expect(s.speed).toBeLessThan(F.cruiseSpeed);
  });

  it('rolls on its own with a roll bias (damaged wing)', () => {
    const s = airborne(F.cruiseSpeed);
    run(s, 1, {}, { thrustFactor: 1, controlFactor: 1, rollBias: 0.3 });
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(s.orientation);
    expect(right.y).toBeLessThan(-0.2);
  });

  it('accelerates on the runway and only lifts off above stall speed when pulling up', () => {
    const s = createFlightState(new THREE.Vector3(0, F.groundClearance, 0), 0, true);
    s.throttle = 1;
    run(s, 2, { pitch: 1 });
    expect(s.onGround).toBe(true);
    expect(s.speed).toBeGreaterThan(5);
    run(s, 8, { throttleDelta: 1 });
    expect(s.onGround).toBe(true);
    expect(s.speed).toBeGreaterThan(F.stallSpeed);
    run(s, 0.5, { pitch: 1 });
    expect(s.onGround).toBe(false);
  });

  it('caps level speed at maxSpeed', () => {
    const s = airborne(F.cruiseSpeed, 1);
    run(s, 60);
    expect(s.speed).toBeLessThanOrEqual(F.maxSpeed + 0.5);
  });

  it('climbing costs speed', () => {
    const level = airborne(F.cruiseSpeed);
    const climb = airborne(F.cruiseSpeed);
    climb.orientation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.5);
    climb.velocity.copy(forwardOf(climb)).multiplyScalar(F.cruiseSpeed);
    run(level, 3);
    run(climb, 3);
    expect(climb.speed).toBeLessThan(level.speed - 10);
    expect(climb.position.y).toBeGreaterThan(level.position.y + 50);
  });
});
