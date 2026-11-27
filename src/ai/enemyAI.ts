import * as THREE from 'three';
import { CONFIG } from '../config';
import type { FlightInput } from '../input/types';
import { createFlightState, forwardOf, type FlightState } from '../flight/flightModel';
import { createDamage, type DamageState } from '../flight/damage';
import { createResources, type Resources } from '../flight/resources';
import { leadPoint } from '../combat/ballistics';
import type { CollisionWorld } from '../world/collision';
import type { Runway } from '../world/cityGen';
import { makeRng } from '../core/rng';

export type AIState = 'patrol' | 'pursue' | 'attack' | 'evade' | 'extend' | 'bombRun';

/** Per-enemy temperament, drawn at random so no two enemies fly alike. */
export interface Personality {
  /** 0.3..1: how long it stays on your tail and how soon it comes back */
  aggression: number;
  /** -1 | 1: preferred side when breaking away */
  turnBias: number;
  /** metres above (+) or below (−) the player it likes to approach from */
  altBias: number;
  /** lateral offset (m) of its approach, so wingmen come from different angles */
  flank: number;
}

export interface Enemy {
  id: number;
  kind: 'fighter' | 'bomber';
  flight: FlightState;
  damage: DamageState;
  resources: Resources;
  ai: {
    state: AIState; skill: number; timer: number; noise: THREE.Vector3; evadeDir: THREE.Vector3;
    personality: Personality; stateTime: number; jinkTimer: number;
  };
}

const A = {
  detect: 6000, attackRange: 400, attackCone: 0.6, breakOff: 650, sixRange: 300, sixCone: (135 * Math.PI) / 180,
  fireRange: 500, minAlt: 80, lookAhead: 2, noiseMeters: 25, noisePeriod: 0.6, evadeTime: 2.5,
  rearGunRange: 300, bombAlt: 250, patrolAlt: 350,
  minRange: 120, extendMin: 2.5, extendMax: 7, jinkPeriod: 0.8,
};

export function createEnemy(
  id: number, kind: 'fighter' | 'bomber', pos: THREE.Vector3, headingRad: number, skill: number, rng: () => number = makeRng(id * 7919 + 1),
): Enemy {
  const flight = createFlightState(pos, headingRad, false);
  flight.throttle = 0.8;
  const personality: Personality = {
    aggression: 0.3 + rng() * 0.7,
    turnBias: rng() < 0.5 ? -1 : 1,
    altBias: -80 + rng() * 230,
    flank: (rng() < 0.5 ? -1 : 1) * (40 + rng() * 160),
  };
  return {
    id, kind, flight, damage: createDamage(), resources: createResources(),
    ai: {
      state: kind === 'bomber' ? 'bombRun' : 'patrol', skill, timer: 0, noise: new THREE.Vector3(), evadeDir: new THREE.Vector3(),
      personality, stateTime: 0, jinkTimer: 0,
    },
  };
}

/** Pick a break-away direction: mostly ahead, veering to the preferred side, with some climb or dive. */
function startExtend(e: Enemy, rng: () => number): void {
  const ai = e.ai, p = ai.personality;
  forwardOf(e.flight, _f);
  const side = new THREE.Vector3(-_f.z, 0, _f.x).normalize().multiplyScalar(p.turnBias * (0.4 + rng() * 0.6));
  ai.evadeDir.set(_f.x, 0, _f.z).normalize().add(side).setY((rng() - 0.35) * 0.5).normalize();
  ai.state = 'extend';
  ai.stateTime = 0;
  ai.jinkTimer = A.jinkPeriod;
}

const _inv = new THREE.Quaternion();
const _l = new THREE.Vector3();
const _f = new THREE.Vector3();
const clamp = (v: number, a = -1, b = 1) => Math.min(b, Math.max(a, v));

/** Bank-and-pull steering towards a world point. */
export function steerTo(s: FlightState, point: THREE.Vector3): { pitch: number; roll: number; yaw: number } {
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
    const pers = ai.personality;
    ai.stateTime += dt;
    switch (ai.state) {
      case 'patrol':
        if (dist < A.detect) ai.state = 'pursue';
        break;
      case 'evade':
        if (ai.timer <= 0 || dist > A.breakOff) { ai.state = 'pursue'; ai.stateTime = 0; }
        break;
      case 'attack':
        if (dist > A.breakOff) { ai.state = 'pursue'; ai.stateTime = 0; }
        // A firing pass lasts a few seconds, longer for aggressive pilots, then they break away.
        else if (ai.stateTime > 2 + 4 * pers.aggression) startExtend(e, rng);
        break;
      case 'extend': {
        const done = ai.stateTime > A.extendMax || (ai.stateTime > A.extendMin && dist > 450 + 350 * (1 - pers.aggression));
        if (done) { ai.state = 'pursue'; ai.stateTime = 0; }
        break;
      }
    }
    if (ai.state !== 'extend' && dist < A.minRange) startExtend(e, rng);
    else if (ai.state !== 'evade' && ai.state !== 'extend' && dist < A.sixRange && off > A.sixCone) {
      ai.state = 'evade';
      ai.timer = A.evadeTime * (0.6 + rng() * 0.8);
      forwardOf(s, _f);
      ai.evadeDir.set(-_f.z, rng() < 0.5 ? -0.3 : 0.3, _f.x).multiplyScalar(pers.turnBias).normalize();
    } else if (ai.state === 'pursue' && dist < A.attackRange && off < A.attackCone) {
      ai.state = 'attack';
      ai.stateTime = 0;
    }

    // Jinks: small random changes of the escape direction so trajectories never repeat.
    if (ai.state === 'extend' || ai.state === 'evade') {
      ai.jinkTimer -= dt;
      if (ai.jinkTimer <= 0) {
        ai.jinkTimer = A.jinkPeriod * (0.6 + rng() * 0.8);
        ai.evadeDir.add(new THREE.Vector3((rng() - 0.5) * 0.6, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.6)).normalize();
      }
    }

    if (ai.state === 'patrol') aim = new THREE.Vector3(0, A.patrolAlt, 0);
    else if (ai.state === 'evade' || ai.state === 'extend') aim = s.position.clone().addScaledVector(ai.evadeDir, 300);
    else {
      aim = lead.clone().add(ai.noise);
      if (ai.state === 'pursue') {
        // Approach from the enemy's own angle: lateral and vertical offsets fade out as it closes in.
        const k = Math.min(1, Math.max(0, (dist - 300) / 900));
        const toP = _l.subVectors(player.position, s.position).setY(0).normalize();
        aim.add(new THREE.Vector3(-toP.z, 0, toP.x).multiplyScalar(pers.flank * k)).add(new THREE.Vector3(0, pers.altBias * k, 0));
      }
    }

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
