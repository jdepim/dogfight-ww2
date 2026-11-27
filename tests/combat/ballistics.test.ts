import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BulletPool, leadPoint, type HitTarget } from '../../src/combat/ballistics';
import { CollisionWorld } from '../../src/world/collision';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DT = 1 / 60;
const empty = new CollisionWorld([]);

describe('leadPoint', () => {
  it('returns the target itself when nothing moves', () => {
    const p = leadPoint(V(0, 0, 0), V(0, 0, 0), V(0, 0, -500), V(0, 0, 0), 600)!;
    expect(p.distanceTo(V(0, 0, -500))).toBeLessThan(1e-6);
  });

  it('leads a crossing target so a bullet meets it', () => {
    const shooter = V(0, 0, 0), sv = V(0, 0, -100);
    const target = V(0, 0, -600), tv = V(100, 0, 0);
    const aim = leadPoint(shooter, sv, target, tv, 600)!;
    expect(aim.x).toBeGreaterThan(target.x + 10);
    const dir = aim.clone().sub(shooter).normalize();
    const bvel = sv.clone().addScaledVector(dir, 600);
    let best = Infinity;
    for (let t = 0; t < 3; t += 0.001) {
      const b = shooter.clone().addScaledVector(bvel, t);
      const tg = target.clone().addScaledVector(tv, t);
      best = Math.min(best, b.distanceTo(tg));
    }
    expect(best).toBeLessThan(1);
  });

  it('returns null for a receding target faster than the bullet', () => {
    expect(leadPoint(V(0, 0, 0), V(0, 0, 0), V(0, 0, -500), V(0, 0, -700), 600)).toBeNull();
  });
});

describe('BulletPool', () => {
  it('hits a target sitting between two step positions (no tunnelling)', () => {
    const pool = new BulletPool();
    const target: HitTarget = { id: 2, position: V(0, 100, -15), radius: 3 };
    pool.spawn(V(0, 100, -10.5), V(0, 0, -1), V(0, 0, 0), 1);
    const hits: number[] = [];
    pool.step(DT, empty, [target], (_b, t) => hits.push(t.id));
    expect(hits).toEqual([2]);
    expect(pool.bullets.filter((b) => b.alive).length).toBe(0);
  });

  it('never hits its own shooter', () => {
    const pool = new BulletPool();
    const self: HitTarget = { id: 1, position: V(0, 100, 0), radius: 3 };
    pool.spawn(V(0, 100, 0), V(0, 0, -1), V(0, 0, 0), 1);
    let hit = false;
    for (let i = 0; i < 10; i++) pool.step(DT, empty, [self], () => { hit = true; });
    expect(hit).toBe(false);
  });

  it('expires after its range', () => {
    const pool = new BulletPool();
    pool.spawn(V(0, 500, 0), V(0, 0, -1), V(0, 0, 0), 1);
    for (let i = 0; i < 60 * 1.2; i++) pool.step(DT, empty, [], () => {});
    expect(pool.bullets.filter((b) => b.alive).length).toBe(1);
    for (let i = 0; i < 60 * 0.3; i++) pool.step(DT, empty, [], () => {});
    expect(pool.bullets.filter((b) => b.alive).length).toBe(0);
  });

  it('is stopped by a wall and does not hit what is behind it', () => {
    const wall = new CollisionWorld([{ min: V(-10, 0, -60), max: V(10, 200, -55), style: 'tower', seed: 0 }]);
    const pool = new BulletPool();
    const behind: HitTarget = { id: 2, position: V(0, 100, -100), radius: 3 };
    pool.spawn(V(0, 100, 0), V(0, 0, -1), V(0, 0, 0), 1);
    let hit = false;
    for (let i = 0; i < 30; i++) pool.step(DT, wall, [behind], () => { hit = true; });
    expect(hit).toBe(false);
    expect(pool.bullets.filter((b) => b.alive).length).toBe(0);
  });

  it('marks one bullet in four as a tracer', () => {
    const pool = new BulletPool();
    for (let i = 0; i < 8; i++) pool.spawn(V(0, 100, 0), V(0, 0, -1), V(0, 0, 0), 1);
    expect(pool.bullets.filter((b) => b.alive && b.tracer).length).toBe(2);
  });

  it('inherits the shooter velocity', () => {
    const pool = new BulletPool();
    pool.spawn(V(0, 100, 0), V(0, 0, -1), V(0, 0, -100), 1);
    const b = pool.bullets.find((x) => x.alive)!;
    expect(b.vel.z).toBeCloseTo(-700, 5);
  });
});
