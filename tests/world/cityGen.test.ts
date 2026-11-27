import { describe, it, expect } from 'vitest';
import { generateWorld } from '../../src/world/cityGen';
import { CONFIG } from '../../src/config';

describe('generateWorld', () => {
  const w = generateWorld(CONFIG.world.seed);

  it('is deterministic', () => {
    expect(JSON.stringify(generateWorld(CONFIG.world.seed))).toBe(JSON.stringify(w));
    expect(JSON.stringify(generateWorld(7))).not.toBe(JSON.stringify(w));
  });

  it('keeps buildings away from the runway (150 m from its axis along its length)', () => {
    const rw = w.runway;
    for (const b of w.buildings) {
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      const dx = cx - rw.center.x, dz = cz - rw.center.z;
      const h = rw.headingRad;
      const along = dx * Math.sin(h) - dz * Math.cos(h);
      const across = Math.abs(dx * Math.cos(h) + dz * Math.sin(h));
      if (Math.abs(along) < rw.length / 2 + 300) expect(across).toBeGreaterThan(150);
    }
  });

  it('has at least 10 towers between 40 and 200 m tall', () => {
    const towers = w.buildings.filter((b) => b.style === 'tower');
    expect(towers.length).toBeGreaterThanOrEqual(10);
    for (const t of towers) {
      expect(t.max.y).toBeGreaterThanOrEqual(40);
      expect(t.max.y).toBeLessThanOrEqual(200);
    }
  });

  it('leaves streets of at least 30 m between towers', () => {
    const towers = w.buildings.filter((b) => b.style === 'tower');
    for (let i = 0; i < towers.length; i++)
      for (let j = i + 1; j < towers.length; j++) {
        const a = towers[i], b = towers[j];
        const gx = Math.max(a.min.x - b.max.x, b.min.x - a.max.x);
        const gz = Math.max(a.min.z - b.max.z, b.min.z - a.max.z);
        expect(Math.max(gx, gz)).toBeGreaterThanOrEqual(30);
      }
  });

  it('stays inside the map', () => {
    const h = CONFIG.world.size / 2;
    for (const b of w.buildings) {
      expect(b.min.x).toBeGreaterThanOrEqual(-h); expect(b.max.x).toBeLessThanOrEqual(h);
      expect(b.min.z).toBeGreaterThanOrEqual(-h); expect(b.max.z).toBeLessThanOrEqual(h);
    }
  });

  it('has villages of houses', () => {
    expect(w.buildings.filter((b) => b.style === 'house').length).toBeGreaterThanOrEqual(20);
  });
});
