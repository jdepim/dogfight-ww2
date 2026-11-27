import * as THREE from 'three';
import { CONFIG } from '../config';
import type { FlightState } from '../flight/flightModel';
import { forwardOf, rightOf } from '../flight/flightModel';
import type { Runway } from './cityGen';

export type LandingResult = 'airborne' | 'landed' | 'crash';

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();

/** Position relative to the runway: along its axis and across it (metres). */
export function runwayLocal(p: THREE.Vector3, rw: Runway): { along: number; across: number } {
  const dx = p.x - rw.center.x, dz = p.z - rw.center.z, h = rw.headingRad;
  return { along: dx * Math.sin(h) - dz * Math.cos(h), across: dx * Math.cos(h) + dz * Math.sin(h) };
}

export function onRunway(p: THREE.Vector3, rw: Runway): boolean {
  const l = runwayLocal(p, rw);
  return Math.abs(l.along) <= rw.length / 2 && Math.abs(l.across) <= rw.width / 2;
}

/** Evaluate contact with the ground. Call each step while airborne. */
export function checkTouchdown(s: FlightState, rw: Runway, currentWave: number): { result: LandingResult; reason?: string } {
  const L = CONFIG.landing;
  if (s.position.y > CONFIG.flight.groundClearance + 0.01) return { result: 'airborne' };
  if (!onRunway(s.position, rw)) return { result: 'crash', reason: 'Hors piste' };
  if (rw.destroyedUntilWave >= currentWave) return { result: 'crash', reason: 'Piste détruite' };
  const horiz = Math.hypot(s.velocity.x, s.velocity.z);
  if (horiz > L.maxSpeed) return { result: 'crash', reason: 'Trop rapide' };
  if (-s.velocity.y > L.maxSink) return { result: 'crash', reason: 'Atterrissage trop brutal' };
  rightOf(s, _r);
  const roll = Math.abs(Math.asin(Math.max(-1, Math.min(1, _r.y))));
  if (roll > (L.maxRollDeg * Math.PI) / 180) return { result: 'crash', reason: 'Ailes pas à plat' };
  forwardOf(s, _f);
  const heading = Math.atan2(_f.x, -_f.z);
  let diff = Math.abs(heading - rw.headingRad) % Math.PI;
  diff = Math.min(diff, Math.PI - diff);
  if (diff > (L.maxHeadingDeg * Math.PI) / 180) return { result: 'crash', reason: 'Mauvais alignement' };
  return { result: 'landed' };
}

/** Automatic landing gear. */
export function gearDown(s: FlightState, rw: Runway): boolean {
  if (s.onGround) return true;
  const d = Math.hypot(s.position.x - rw.center.x, s.position.z - rw.center.z);
  return s.position.y < 60 && s.speed < 75 && d < 1500;
}

export function inRefuelZone(s: FlightState, rw: Runway): boolean {
  const z = rw.refuelZone;
  return s.onGround && s.position.x >= z.min.x && s.position.x <= z.max.x && s.position.z >= z.min.z && s.position.z <= z.max.z;
}
