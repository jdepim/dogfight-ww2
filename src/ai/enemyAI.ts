import * as THREE from 'three';
import { CONFIG } from '../config';
import type { FlightInput } from '../input/types';
import { createFlightState, forwardOf, type FlightState } from '../flight/flightModel';
import { createDamage, type DamageState } from '../flight/damage';
import { createResources, type Resources } from '../flight/resources';
import { leadPoint } from '../combat/ballistics';
import type { CollisionWorld } from '../world/collision';
import type { Runway } from '../world/cityGen';

export type AIState = 'patrol' | 'pursue' | 'attack' | 'evade' | 'bombRun';

export interface Enemy {
  id: number;
  kind: 'fighter' | 'bomber';
  flight: FlightState;
  damage: DamageState;
  resources: Resources;
  ai: { state: AIState; skill: number; timer: number; noise: THREE.Vector3; evadeDir: THREE.Vector3 };
}

const A = {
  detect: 1500, attackRange: 400, attackCone: 0.6, breakOff: 650, sixRange: 300, sixCone: (135 * Math.PI) / 180,
  fireRange: 500, minAlt: 80, lookAhead: 2, noiseMeters: 25, noisePeriod: 0.6, evadeTime: 2.5,
  rearGunRange: 300, bombAlt: 250, patrolAlt: 350,
};

export function createEnemy(id: number, kind: 'fighter' | 'bomber', pos: THREE.Vector3, headingRad: number, skill: number): Enemy {
  const flight = createFlightState(pos, headingRad, false);
  flight.throttle = 0.8;
  return {
    id, kind, flight, damage: createDamage(), resources: createResources(),
    ai: { state: kind === 'bomber' ? 'bombRun' : 'patrol', skill, timer: 0, noise: new THREE.Vector3(), evadeDir: new THREE.Vector3() },
  };
}

const _inv = new THREE.Quaternion();
const _l = new THREE.Vector3();
const _f = new THREE.Vector3();
const clamp = (v: number, a = -1, b = 1) => Math.min(b, Math.max(a, v));

/** Bank-and-pull steering towards a world point. */
function steerTo(s: FlightState, point: THREE.Vector3): { pitch: number; roll: number; yaw: number } {
  _inv.copy(s.orientation).invert();
  _l.subVectors(point, s.position).applyQuaternion(_inv).normalize();
  const off = Math.acos(clamp(-_l.z));
  if (off < 0.15) {
    // Nearly ahead: fine corrections, keep wings level-ish.
    return { pitch: clamp(_l.y * 8), roll: clamp(_l.x * 6), yaw: clamp(_l.x * 6) };
  }
  const rollErr = Math.atan2(_l.x, _l.y); // bank so the target is overhead
  const pull = Math.max(0, Math.cos(rollErr)) * clamp(off * 2.5);
  return { pitch: pull, roll: clamp(rollErr * 2), yaw: 0 };
}

function angleTo(s: FlightState, p: THREE.Vector3): number {
  forwardOf(s, _f);
  return _f.angleTo(_l.subVectors(p, s.position));
}

/** Decide the enemy's commands for this step. Mutates only `e.ai`. */
export function thinkEnemy(e: Enemy, player: FlightState, world: CollisionWorld, runway: Runway, rng: () => number): FlightInput {
  const s = e.flight;
  const ai = e.ai;
  const dt = CONFIG.sim.step;
  ai.timer -= dt;
  const dist = s.position.distanceTo(player.position);
  const throttleDelta = clamp((0.85 - s.throttle) * 5);
  let fire = false;
  let aim: THREE.Vector3;

  // Aim error shrinks with skill; refreshed periodically.
  if (ai.timer <= 0) {
    const r = (1 - ai.skill) * A.noiseMeters;
    ai.noise.set((rng() - 0.5) * 2 * r, (rng() - 0.5) * 2 * r, (rng() - 0.5) * 2 * r);
    ai.timer = A.noisePeriod;
  }

  const lead = leadPoint(s.position, s.velocity, player.position, player.velocity, CONFIG.bullets.speed) ?? player.position.clone();

  if (e.kind === 'bomber') {
    ai.state = 'bombRun';
    aim = new THREE.Vector3(runway.center.x, A.bombAlt, runway.center.z);
    forwardOf(s, _f);
    const toP = _l.subVectors(player.position, s.position);
    fire = dist < A.rearGunRange && _f.dot(toP) < 0;
  } else {
    const off = angleTo(s, player.position);
    switch (ai.state) {
      case 'patrol':
        if (dist < A.detect) ai.state = 'pursue';
        break;
      case 'evade':
        if (ai.timer <= 0 || dist > A.breakOff) ai.state = 'pursue';
        break;
      case 'attack':
        if (dist > A.breakOff) ai.state = 'pursue';
        break;
    }
    if (ai.state !== 'evade' && dist < A.sixRange && off > A.sixCone) {
      ai.state = 'evade';
      ai.timer = A.evadeTime * (0.6 + rng() * 0.8);
      forwardOf(s, _f);
      ai.evadeDir.set(-_f.z, rng() < 0.5 ? -0.3 : 0.3, _f.x).multiplyScalar(rng() < 0.5 ? 1 : -1).normalize();
    } else if (ai.state === 'pursue' && dist < A.attackRange && off < A.attackCone) {
      ai.state = 'attack';
    }

    if (ai.state === 'patrol') aim = new THREE.Vector3(0, A.patrolAlt, 0);
    else if (ai.state === 'evade') aim = s.position.clone().addScaledVector(ai.evadeDir, 300);
    else aim = lead.clone().add(ai.noise);

    if (ai.state === 'attack' && dist < A.fireRange) {
      const tol = 0.03 + 0.12 * (1 - ai.skill);
      fire = angleTo(s, lead.clone().add(ai.noise)) < tol;
    }
  }

  // Safety overrides: ground and buildings.
  const ahead = s.position.clone().addScaledVector(s.velocity, A.lookAhead);
  const low = s.position.y < A.minAlt || ahead.y < A.minAlt;
  if (low || world.segmentHits(s.position, ahead)) {
    forwardOf(s, _f);
    aim = s.position.clone().add(new THREE.Vector3(_f.x, 0, _f.z).normalize().multiplyScalar(100)).add(new THREE.Vector3(0, 200, 0));
    fire = fire && !low;
  }
  // Avoid stalling: never aim steeply up when slow.
  if (s.speed < CONFIG.flight.stallSpeed * 1.25 && aim.y > s.position.y && !low) aim.y = s.position.y;

  const st = steerTo(s, aim);
  return { pitch: st.pitch, roll: st.roll, yaw: st.yaw, throttleDelta, fire };
}
