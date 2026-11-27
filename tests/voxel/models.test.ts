import { describe, it, expect } from 'vitest';
import { makePlayerFighter, makeEnemyFighter, makeBomber, makeBuilding } from '../../src/voxel/models';
import type { VoxelGrid } from '../../src/voxel/voxelGrid';

function extentZ(g: VoxelGrid): number {
  let min = Infinity, max = -Infinity;
  for (let z = 0; z < g.sz; z++) for (let y = 0; y < g.sy; y++) for (let x = 0; x < g.sx; x++)
    if (g.get(x, y, z)) { min = Math.min(min, z); max = Math.max(max, z); }
  return max - min + 1;
}

function symmetric(g: VoxelGrid): boolean {
  for (let z = 0; z < g.sz; z++) for (let y = 0; y < g.sy; y++) for (let x = 0; x < g.sx; x++)
    if ((g.get(x, y, z) !== 0) !== (g.get(g.sx - 1 - x, y, z) !== 0)) return false;
  return true;
}

describe('models', () => {
  it('player fighter is about 30 voxels long and symmetric', () => {
    const g = makePlayerFighter();
    const len = extentZ(g);
    expect(len).toBeGreaterThanOrEqual(28);
    expect(len).toBeLessThanOrEqual(32);
    expect(symmetric(g)).toBe(true);
  });

  it('enemy fighter is symmetric and differs in colours from player', () => {
    const p = makePlayerFighter(), e = makeEnemyFighter();
    expect(symmetric(e)).toBe(true);
    const colours = (g: VoxelGrid) => new Set(Array.from(g.data).filter((c) => c));
    const shared = [...colours(e)].filter((c) => colours(p).has(c));
    expect(shared.length).toBeLessThan(colours(e).size);
  });

  it('bomber is longer than a fighter', () => {
    expect(extentZ(makeBomber())).toBeGreaterThan(extentZ(makePlayerFighter()));
  });

  it('buildings are deterministic for a seed', () => {
    const a = makeBuilding(8, 20, 8, 'tower', 42), b = makeBuilding(8, 20, 8, 'tower', 42);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    const c = makeBuilding(8, 20, 8, 'tower', 43);
    expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
  });
});
