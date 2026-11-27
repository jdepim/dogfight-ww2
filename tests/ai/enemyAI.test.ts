import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { thinkEnemy, createEnemy, type Enemy } from '../../src/ai/enemyAI';
import { createFlightState, forwardOf, type FlightState } from '../../src/flight/flightModel';
import { CollisionWorld } from '../../src/world/collision';
import { generateWorld } from '../../src/world/cityGen';
import { makeRng } from '../../src/core/rng';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const runway = generateWorld(1944).runway;
const empty = new CollisionWorld([]);

function plane(pos: THREE.Vector3, heading = 0, speed = 110): FlightState {
  const s = createFlightState(pos, heading, false);
  s.velocity.copy(forwardOf(s)).multiplyScalar(speed);
  s.speed = speed;
  s.throttle = 0.6;
  return s;
}

function fighter(pos = V(0, 500, 0), skill = 1): Enemy {
  const e = createEnemy(1, 'fighter', pos, 0, skill);
  e.flight.velocity.copy(forwardOf(e.flight)).multiplyScalar(110);
  e.flight.speed = 110;
  return e;
}

describe('thinkEnemy', () => {
  it('pursues a distant player and turns towards it', () => {
    const e = fighter();
    const cmd = thinkEnemy(e, plane(V(1000, 500, 0)), empty, runway, makeRng(1));
    expect(e.ai.state).toBe('pursue');
    expect(cmd.roll).toBeGreaterThan(0.2);
  });

  it('attacks a close player ahead and fires only when lined up', () => {
    const e = fighter();
    const ahead = plane(V(0, 500, -300));
    const cmd = thinkEnemy(e, ahead, empty, runway, makeRng(1));
    expect(e.ai.state).toBe('attack');
    expect(cmd.fire).toBe(true);
    const e2 = fighter();
    const off = plane(V(300 * Math.sin(0.5), 500, -300 * Math.cos(0.5)));
    thinkEnemy(e2, off, empty, runway, makeRng(1));
    const cmd2 = thinkEnemy(e2, off, empty, runway, makeRng(1));
    expect(cmd2.fire).toBe(false);
  });

  it('evades a player sitting on its six', () => {
    const e = fighter();
    thinkEnemy(e, plane(V(0, 500, 200)), empty, runway, makeRng(1));
    expect(e.ai.state).toBe('evade');
  });

  it('pulls up when too low, whatever its state', () => {
    const e = fighter(V(0, 50, 0));
    const cmd = thinkEnemy(e, plane(V(0, 20, -300)), empty, runway, makeRng(1));
    expect(cmd.pitch).toBeGreaterThan(0.3);
  });

  it('pulls up before hitting a building', () => {
    const tower = new CollisionWorld([{ min: V(-30, 0, -200), max: V(30, 600, -150), style: 'tower', seed: 0 }]);
    const e = fighter(V(0, 300, 0));
    const cmd = thinkEnemy(e, plane(V(0, 300, -1200)), tower, runway, makeRng(1));
    expect(cmd.pitch).toBeGreaterThan(0.3);
  });

  it('bombers keep their bomb run and fire their rear gun at a chaser', () => {
    const b = createEnemy(2, 'bomber', V(0, 250, 0), 0, 0.5);
    b.flight.velocity.set(0, 0, -90); b.flight.speed = 90;
    const cmd = thinkEnemy(b, plane(V(0, 250, 150)), empty, runway, makeRng(1));
    expect(b.ai.state).toBe('bombRun');
    expect(cmd.fire).toBe(true);
    const cmd2 = thinkEnemy(b, plane(V(0, 250, -150)), empty, runway, makeRng(1));
    expect(cmd2.fire).toBe(false);
  });

  it('is deterministic for a given rng seed', () => {
    const run = () => {
      const e = fighter(V(0, 500, 0), 0.3);
      const rng = makeRng(42);
      const p = plane(V(400, 520, -200), 1);
      return Array.from({ length: 20 }, () => JSON.stringify(thinkEnemy(e, p, empty, runway, rng)));
    };
    expect(run()).toEqual(run());
  });
});

import { stepFlight, NEUTRAL_MODS } from '../../src/flight/flightModel';

describe('enemy flight integration', () => {
  it('chases a circling player over the real city for 60 s without crashing, and gets a firing chance', () => {
    const layout = generateWorld(1944);
    const city = new CollisionWorld(layout.buildings);
    const rng = makeRng(3);
    const p = plane(V(0, 250, 0));
    const e = fighter(V(1200, 300, 800), 0.6);
    let fired = 0, minAlt = Infinity, hit = false;
    for (let i = 0; i < 60 * 60; i++) {
      stepFlight(p, { pitch: 0.35, roll: 0.25, yaw: 0, throttleDelta: 0, fire: false }, NEUTRAL_MODS, true, 1 / 60);
      if (p.position.y < 200) p.position.y = 200; // keep the target up
      const cmd = thinkEnemy(e, p, city, layout.runway, rng);
      stepFlight(e.flight, cmd, NEUTRAL_MODS, true, 1 / 60);
      if (cmd.fire) fired++;
      minAlt = Math.min(minAlt, e.flight.position.y);
      if (city.sphereHits(e.flight.position, 3)) hit = true;
    }
    expect(hit).toBe(false);
    expect(minAlt).toBeGreaterThan(5);
    expect(fired).toBeGreaterThan(0);
  });
});

import { Game } from '../../src/game/game';

describe('enemy variety (no endless circling)', () => {
  function dogfight(seed: number) {
    const g = new Game(generateWorld(1944), makeRng(seed)); g.start();
    const f = g.player.flight; f.onGround = false; f.position.set(0, 500, 0); f.velocity.set(0, 0, -110); f.speed = 110; f.throttle = 0.5;
    g.step({ pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, fire: false }, 1 / 60);
    let close = 0, samples = 0, sepSum = 0, passes = 0, wasClose = false;
    for (let i = 0; i < 90 * 60; i++) {
      g.player.damage.hp = 100; g.player.resources.fuel = 200; if (f.position.y < 300) f.position.y = 500;
      g.step({ pitch: 0.3, roll: i % 600 < 300 ? 0.15 : -0.15, yaw: 0, throttleDelta: 0, fire: false }, 1 / 60);
      if (g.enemies.length < 2) break;
      const [a, b] = g.enemies;
      const da = a.flight.position.distanceTo(f.position);
      if (i > 20 * 60) {
        samples++;
        if (da < 100) close++;
        sepSum += a.flight.position.distanceTo(b.flight.position);
        const nowClose = da < 350;
        if (nowClose && !wasClose) passes++;
        wasClose = nowClose;
      }
    }
    return { closeFrac: close / samples, avgSep: sepSum / samples, passes };
  }

  it('does not orbit the player at point-blank range, but keeps coming back for passes', () => {
    const r = dogfight(2);
    expect(r.closeFrac).toBeLessThan(0.15);
    expect(r.passes).toBeGreaterThanOrEqual(3);
  });

  it('wingmen split up instead of flying glued together', () => {
    expect(dogfight(2).avgSep).toBeGreaterThan(200);
  });

  it('breaks away when closer than 120 m', () => {
    const e = fighter(V(0, 500, 0), 0.8);
    thinkEnemy(e, plane(V(0, 500, -80)), empty, runway, makeRng(1));
    expect(e.ai.state).toBe('extend');
  });

  it('gives each enemy its own temperament', () => {
    const rng = makeRng(9);
    const a = createEnemy(1, 'fighter', V(0, 500, 0), 0, 0.5, rng);
    const b = createEnemy(2, 'fighter', V(0, 500, 0), 0, 0.5, rng);
    expect(a.ai.personality).not.toEqual(b.ai.personality);
  });
});
