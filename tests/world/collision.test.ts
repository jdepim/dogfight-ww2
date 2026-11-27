import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CollisionWorld, outOfBounds } from '../../src/world/collision';
import type { Building } from '../../src/world/cityGen';
import { CONFIG } from '../../src/config';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const box: Building = { min: V(0, 0, 0), max: V(10, 50, 10), style: 'tower', seed: 1 };
const thin: Building = { min: V(200, 0, 200), max: V(201, 50, 260), style: 'tower', seed: 2 };

describe('CollisionWorld', () => {
  const w = new CollisionWorld([box, thin]);
  it('detects a sphere inside a box', () => expect(w.sphereHits(V(5, 20, 5), 2)).toBe(true));
  it('misses a sphere just clear of a face', () => expect(w.sphereHits(V(12.1, 20, 5), 2)).toBe(false));
  it('hits a sphere touching an edge', () => expect(w.sphereHits(V(11.5, 20, 5), 2)).toBe(true));
  it('detects a segment crossing a thin wall', () => expect(w.segmentHits(V(195, 10, 230), V(205, 10, 230))).toBe(true));
  it('misses a segment passing beside', () => expect(w.segmentHits(V(195, 10, 300), V(205, 10, 300))).toBe(false));
  it('misses a segment passing above', () => expect(w.segmentHits(V(-5, 60, 5), V(15, 60, 5))).toBe(false));
});

describe('outOfBounds', () => {
  const S = CONFIG.world.size, H = S / 2;
  it('ok in the middle', () => expect(outOfBounds(V(0, 300, 0), S)).toBe('ok'));
  it('warns near the edge', () => expect(outOfBounds(V(H * 0.95, 300, 0), S)).toBe('warn'));
  it('forces beyond the edge', () => expect(outOfBounds(V(0, 300, -H - 1), S)).toBe('force'));
  it('warns near the ceiling', () => expect(outOfBounds(V(0, CONFIG.world.ceiling * 0.97, 0), S)).toBe('warn'));
  it('forces above the ceiling', () => expect(outOfBounds(V(0, CONFIG.world.ceiling + 1, 0), S)).toBe('force'));
});
