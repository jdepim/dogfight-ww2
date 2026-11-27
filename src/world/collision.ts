import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Building } from './cityGen';

const CELL = 100;

/** Spatial hash of building boxes for sphere and segment queries. */
export class CollisionWorld {
  private cells = new Map<string, number[]>();
  constructor(readonly buildings: Building[]) {
    buildings.forEach((b, i) => {
      for (let x = Math.floor(b.min.x / CELL); x <= Math.floor(b.max.x / CELL); x++)
        for (let z = Math.floor(b.min.z / CELL); z <= Math.floor(b.max.z / CELL); z++) {
          const k = `${x},${z}`;
          (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(i);
        }
    });
  }

  private candidates(minX: number, minZ: number, maxX: number, maxZ: number): Set<number> {
    const out = new Set<number>();
    for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++)
      for (let z = Math.floor(minZ / CELL); z <= Math.floor(maxZ / CELL); z++)
        for (const i of this.cells.get(`${x},${z}`) ?? []) out.add(i);
    return out;
  }

  sphereHits(p: THREE.Vector3, r: number): boolean {
    for (const i of this.candidates(p.x - r, p.z - r, p.x + r, p.z + r)) {
      const b = this.buildings[i];
      const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x);
      const dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y);
      const dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
      if (dx * dx + dy * dy + dz * dz <= r * r) return true;
    }
    return false;
  }

  /** True if segment a→b intersects any building box (slab test). */
  segmentHits(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const set = this.candidates(Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z));
    const d = [b.x - a.x, b.y - a.y, b.z - a.z];
    const o = [a.x, a.y, a.z];
    for (const i of set) {
      const bb = this.buildings[i];
      const mn = [bb.min.x, bb.min.y, bb.min.z], mx = [bb.max.x, bb.max.y, bb.max.z];
      let t0 = 0, t1 = 1, hit = true;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-12) {
          if (o[k] < mn[k] || o[k] > mx[k]) { hit = false; break; }
        } else {
          let ta = (mn[k] - o[k]) / d[k], tb = (mx[k] - o[k]) / d[k];
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
          if (t0 > t1) { hit = false; break; }
        }
      }
      if (hit) return true;
    }
    return false;
  }
}

export function groundHeight(): number {
  return 0;
}

/** warn within 10 % of the edge or 5 % of the ceiling; force beyond. */
export function outOfBounds(p: THREE.Vector3, size: number): 'ok' | 'warn' | 'force' {
  const h = size / 2, c = CONFIG.world.ceiling;
  const m = Math.max(Math.abs(p.x), Math.abs(p.z));
  if (m > h || p.y > c) return 'force';
  if (m > h * 0.9 || p.y > c * 0.95) return 'warn';
  return 'ok';
}
