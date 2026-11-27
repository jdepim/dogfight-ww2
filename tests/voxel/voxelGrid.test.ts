import { describe, it, expect } from 'vitest';
import { VoxelGrid, buildGeometry } from '../../src/voxel/voxelGrid';

describe('buildGeometry', () => {
  it('emits 6 faces (24 vertices, 36 indices) for a single voxel', () => {
    const g = new VoxelGrid(3, 3, 3);
    g.set(1, 1, 1, 0xff0000);
    const geo = buildGeometry(g, 1);
    expect(geo.getAttribute('position').count).toBe(24);
    expect(geo.getIndex()!.count).toBe(36);
    expect(geo.getAttribute('color').count).toBe(24);
    expect(geo.getAttribute('normal').count).toBe(24);
  });

  it('culls the shared face between two adjacent voxels', () => {
    const g = new VoxelGrid(3, 3, 3);
    g.set(0, 0, 0, 1);
    g.set(1, 0, 0, 1);
    expect(buildGeometry(g, 1).getAttribute('position').count).toBe(40);
  });

  it('handles an empty grid', () => {
    const geo = buildGeometry(new VoxelGrid(2, 2, 2), 1);
    expect(geo.getAttribute('position').count).toBe(0);
  });

  it('centres the geometry on the origin', () => {
    const g = new VoxelGrid(4, 2, 2);
    g.fillBox(0, 0, 0, 3, 1, 1, 1);
    const geo = buildGeometry(g, 0.5);
    geo.computeBoundingBox();
    const c = geo.boundingBox!.getCenter(new (geo.boundingBox!.min.constructor as any)());
    expect(Math.abs(c.x) + Math.abs(c.y) + Math.abs(c.z)).toBeLessThan(1e-6);
  });
});

describe('VoxelGrid', () => {
  it('mirrorX copies the left half onto the right', () => {
    const g = new VoxelGrid(5, 1, 1);
    g.set(0, 0, 0, 7);
    g.mirrorX();
    expect(g.get(4, 0, 0)).toBe(7);
  });

  it('returns 0 out of bounds', () => {
    expect(new VoxelGrid(2, 2, 2).get(-1, 0, 5)).toBe(0);
  });
});
