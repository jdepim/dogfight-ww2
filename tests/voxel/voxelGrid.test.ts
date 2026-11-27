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
    g.set(1, 0, 0, 2);
    expect(buildGeometry(g, 1).getAttribute('position').count).toBe(40);
  });

  it('merges coplanar faces of the same colour (greedy meshing)', () => {
    const g = new VoxelGrid(8, 4, 8);
    g.fillBox(0, 0, 0, 7, 3, 7, 0x336699);
    expect(buildGeometry(g, 1).getAttribute('position').count).toBe(24);
  });

  it('keeps the same surface area after merging', () => {
    const g = new VoxelGrid(4, 4, 4);
    g.fillBox(0, 0, 0, 3, 3, 3, 0x111111);
    g.set(1, 3, 1, 0x222222);
    const geo = buildGeometry(g, 1);
    const pos = geo.getAttribute('position'), idx = geo.getIndex()!;
    let area = 0;
    for (let i = 0; i < idx.count; i += 3) {
      const p = [0, 1, 2].map((k) => { const j = idx.getX(i + k); return [pos.getX(j), pos.getY(j), pos.getZ(j)]; });
      const u = p[1].map((v, k) => v - p[0][k]), w = p[2].map((v, k) => v - p[0][k]);
      const c = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      area += Math.hypot(c[0], c[1], c[2]) / 2;
    }
    expect(area).toBeCloseTo(6 * 16, 5);
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

it('winds every triangle counter-clockwise around its normal', () => {
  const g = new VoxelGrid(3, 3, 3);
  g.fillBox(0, 0, 0, 2, 1, 2, 5);
  g.set(1, 2, 1, 9);
  const geo = buildGeometry(g, 1);
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), idx = geo.getIndex()!;
  for (let i = 0; i < idx.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => idx.getX(i + k));
    const P = (j: number) => [pos.getX(j), pos.getY(j), pos.getZ(j)];
    const pa = P(a), pb = P(b), pc = P(c);
    const u = pb.map((v, k) => v - pa[k]), w = pc.map((v, k) => v - pa[k]);
    const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    expect(cr[0] * nor.getX(a) + cr[1] * nor.getY(a) + cr[2] * nor.getZ(a)).toBeGreaterThan(0);
  }
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
