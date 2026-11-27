import { VoxelGrid } from './voxelGrid';
import { makeRng } from '../core/rng';

/** Voxel size (m) used to render each family of models. */
export const VOXEL_SIZE = { plane: 0.4, bomber: 0.55, building: 2 } as const;

interface FighterPalette {
  top: number; belly: number; nose: number; glass: number; ringOuter: number; ringInner: number; accent: number;
}

const PLAYER: FighterPalette = {
  top: 0x5b6b3a, belly: 0xa9b8c2, nose: 0x2b2b2b, glass: 0x9fd3f0, ringOuter: 0xf2f2f2, ringInner: 0xc23b22, accent: 0xe8c547,
};
const ENEMY: FighterPalette = {
  top: 0x6d737a, belly: 0xd8d2b8, nose: 0xe0b020, glass: 0x7ab0c8, ringOuter: 0x202020, ringInner: 0xe0b020, accent: 0x8a2a2a,
};

/** Generic WW2-style low-wing fighter. Grid z=0 is the nose. Width 25, height 8, length 30. */
function fighter(p: FighterPalette, squareTips: boolean): VoxelGrid {
  const g = new VoxelGrid(25, 8, 30);
  const c = 12;
  // Fuselage
  g.fillBox(c - 1, 2, 1, c + 1, 4, 20, p.top);
  g.fillBox(c - 1, 2, 1, c + 1, 2, 20, p.belly);
  g.fillBox(c - 1, 3, 21, c + 1, 4, 25, p.top);
  g.fillBox(c, 3, 26, c, 4, 28, p.top);
  // Engine cowling and spinner
  g.fillBox(c - 1, 2, 1, c + 1, 4, 5, p.nose);
  g.set(c, 3, 0, p.accent);
  // Canopy
  g.fillBox(c - 1, 5, 9, c + 1, 5, 13, p.glass);
  g.fillBox(c, 6, 10, c, 6, 12, p.glass);
  // Wings (low), tapered
  g.fillBox(1, 2, 8, c - 2, 2, 13, p.top);
  g.fillBox(1, 1, 8, c - 2, 1, 13, p.belly);
  if (!squareTips) {
    g.fillBox(1, 1, 8, 2, 2, 8, 0);
    g.fillBox(1, 1, 13, 3, 2, 13, 0);
  }
  // Roundel on the wing
  g.fillBox(4, 2, 9, 6, 2, 11, p.ringOuter);
  g.set(5, 2, 10, p.ringInner);
  // Horizontal stabiliser and fin
  g.fillBox(7, 3, 25, c - 1, 3, 28, p.top);
  g.fillBox(c, 5, 24, c, 7, 28, p.top);
  g.set(c, 7, 28, p.accent);
  g.mirrorX();
  return g;
}

export function makePlayerFighter(): VoxelGrid { return fighter(PLAYER, false); }
export function makeEnemyFighter(): VoxelGrid { return fighter(ENEMY, true); }

/** Generic twin-engine bomber. Width 41, height 10, length 40. */
export function makeBomber(): VoxelGrid {
  const g = new VoxelGrid(41, 10, 40);
  const c = 20, body = 0x55604a, belly = 0x9aa5a0, glass = 0x9fd3f0, dark = 0x2b2b2b;
  g.fillBox(c - 2, 3, 2, c + 2, 6, 30, body);
  g.fillBox(c - 2, 3, 2, c + 2, 3, 30, belly);
  g.fillBox(c - 1, 4, 31, c + 1, 6, 37, body);
  g.fillBox(c - 2, 3, 0, c + 2, 6, 1, glass); // glazed nose
  g.fillBox(c - 1, 7, 7, c + 1, 7, 10, glass); // cockpit
  g.fillBox(c - 1, 4, 38, c + 1, 5, 39, glass); // tail gunner
  g.fillBox(1, 5, 10, c - 3, 5, 17, body); // high wing
  g.fillBox(1, 5, 10, 2, 5, 10, 0);
  g.fillBox(8, 3, 7, 10, 5, 14, dark); // engine nacelle
  g.fillBox(9, 3, 6, 9, 4, 6, 0xe8c547);
  g.fillBox(11, 5, 34, c - 1, 5, 38, body); // stabiliser
  g.fillBox(c, 7, 32, c, 9, 38, body); // fin
  g.fillBox(4, 5, 12, 6, 5, 14, 0xf2f2f2);
  g.set(5, 5, 13, 0xc23b22);
  g.mirrorX();
  return g;
}

/** Propeller anchor in metres, model-space (relative to model centre). */
export const PROPELLER_ANCHOR: Record<'player' | 'enemy' | 'bomber', [number, number, number]> = {
  player: [0, (3.5 - 4) * VOXEL_SIZE.plane, (0 - 15) * VOXEL_SIZE.plane],
  enemy: [0, (3.5 - 4) * VOXEL_SIZE.plane, (0 - 15) * VOXEL_SIZE.plane],
  bomber: [0, 0, 0], // bomber has two props at the nacelles; see BOMBER_PROPS
};
export const BOMBER_PROPS: [number, number, number][] = [
  [(9.5 - 20.5) * VOXEL_SIZE.bomber, (4 - 5) * VOXEL_SIZE.bomber, (6 - 20) * VOXEL_SIZE.bomber],
  [(31.5 - 20.5) * VOXEL_SIZE.bomber, (4 - 5) * VOXEL_SIZE.bomber, (6 - 20) * VOXEL_SIZE.bomber],
];

const WALLS = [0xb8b1a3, 0x9c8f80, 0xc9c2b2, 0x8a8f96, 0xa6866a, 0xd0c4a8];
const ROOFS = [0x5a5550, 0x7a3b2e, 0x4b5560, 0x6b6f5a];

/** Building of w×h×d voxels. Towers get a window grid; houses a pitched roof. Deterministic per seed. */
export function makeBuilding(w: number, h: number, d: number, style: 'tower' | 'house', seed: number): VoxelGrid {
  const rng = makeRng(seed);
  const wall = WALLS[Math.floor(rng() * WALLS.length)];
  const roof = ROOFS[Math.floor(rng() * ROOFS.length)];
  if (style === 'house') {
    const roofH = Math.ceil(Math.min(w, d) / 2);
    const g = new VoxelGrid(w, h + roofH, d);
    g.fillBox(0, 0, 0, w - 1, h - 1, d - 1, wall);
    for (let i = 0; i < roofH; i++) g.fillBox(i, h + i, 0, w - 1 - i, h + i, d - 1, roof);
    g.fillBox(Math.floor(w / 2), 0, 0, Math.floor(w / 2), 1, 0, 0x4a3426); // door
    return g;
  }
  const g = new VoxelGrid(w, h + 1, d);
  g.fillBox(0, 0, 0, w - 1, h - 1, d - 1, wall);
  const lit = 0xf0d890, dark = 0x2c3540;
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      g.set(x, y, 0, rng() < 0.25 ? lit : dark);
      g.set(x, y, d - 1, rng() < 0.25 ? lit : dark);
    }
    for (let z = 1; z < d - 1; z += 2) {
      g.set(0, y, z, rng() < 0.25 ? lit : dark);
      g.set(w - 1, y, z, rng() < 0.25 ? lit : dark);
    }
  }
  g.fillBox(0, h - 1, 0, w - 1, h - 1, d - 1, roof);
  if (w > 3 && d > 3) g.fillBox(1, h, 1, Math.min(2, w - 2), h, Math.min(2, d - 2), roof); // roof box
  return g;
}
