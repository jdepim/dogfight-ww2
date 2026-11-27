import * as THREE from 'three';
import { CONFIG } from '../config';
import type { CollisionWorld } from '../world/collision';

export interface Bullet {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  travelled: number;
  ownerId: number;
  tracer: boolean;
  alive: boolean;
}

export interface HitTarget {
  id: number;
  position: THREE.Vector3;
  radius: number;
}

const POOL_SIZE = 512;
const _end = new THREE.Vector3();
const _d = new THREE.Vector3();
const _w = new THREE.Vector3();
const _hit = new THREE.Vector3();

/** Fixed-size recycled bullet pool; hits are tested along each step's segment. */
export class BulletPool {
  readonly bullets: Bullet[] = [];
  private next = 0;
  private spawned = 0;

  constructor() {
    for (let i = 0; i < POOL_SIZE; i++)
      this.bullets.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), travelled: 0, ownerId: -1, tracer: false, alive: false });
  }

  spawn(from: THREE.Vector3, dir: THREE.Vector3, inheritVel: THREE.Vector3, ownerId: number): void {
    const b = this.bullets[this.next];
    this.next = (this.next + 1) % POOL_SIZE;
    b.pos.copy(from);
    b.vel.copy(inheritVel).addScaledVector(dir, CONFIG.bullets.speed);
    b.travelled = 0;
    b.ownerId = ownerId;
    b.tracer = this.spawned % CONFIG.bullets.tracerEvery === 0;
    b.alive = true;
    this.spawned++;
  }

  clear(): void {
    for (const b of this.bullets) b.alive = false;
  }

  step(dt: number, world: CollisionWorld, targets: readonly HitTarget[], onHit: (b: Bullet, t: HitTarget, point: THREE.Vector3) => void): void {
    const g = CONFIG.flight.gravity * CONFIG.bullets.gravityFactor;
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.vel.y -= g * dt;
      _end.copy(b.pos).addScaledVector(b.vel, dt);
      _d.subVectors(_end, b.pos);
      const len2 = _d.lengthSq();

      // Earliest target along the segment.
      let best: HitTarget | null = null, bestT = Infinity;
      for (const t of targets) {
        if (t.id === b.ownerId) continue;
        _w.subVectors(t.position, b.pos);
        const s = len2 > 0 ? Math.max(0, Math.min(1, _w.dot(_d) / len2)) : 0;
        const dist2 = _w.distanceToSquared(_hit.copy(_d).multiplyScalar(s));
        if (dist2 <= t.radius * t.radius && s < bestT) { best = t; bestT = s; }
      }

      if (best) {
        _hit.copy(b.pos).addScaledVector(_d, bestT);
        b.alive = false;
        if (!world.segmentHits(b.pos, _hit)) onHit(b, best, _hit.clone());
        continue;
      }
      if (world.segmentHits(b.pos, _end) || _end.y <= 0) { b.alive = false; continue; }
      b.travelled += Math.sqrt(len2);
      b.pos.copy(_end);
      if (b.travelled > CONFIG.bullets.range) b.alive = false;
    }
  }
}

/**
 * Where the shooter must aim so a bullet (inheriting the shooter's velocity) meets a target moving
 * at constant velocity. Returns null when no interception is possible.
 */
export function leadPoint(
  shooter: THREE.Vector3, shooterVel: THREE.Vector3, target: THREE.Vector3, targetVel: THREE.Vector3, bulletSpeed: number,
): THREE.Vector3 | null {
  const D = new THREE.Vector3().subVectors(target, shooter);
  const V = new THREE.Vector3().subVectors(targetVel, shooterVel);
  const a = V.dot(V) - bulletSpeed * bulletSpeed;
  const b = 2 * D.dot(V);
  const c = D.dot(D);
  let t: number;
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) < 1e-9) return null;
    t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
    const cands = [t1, t2].filter((x) => x >= 0);
    if (!cands.length) return null;
    t = Math.min(...cands);
  }
  if (t < 0) return null;
  return shooter.clone().add(D).addScaledVector(V, t);
}
