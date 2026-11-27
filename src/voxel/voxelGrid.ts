import * as THREE from 'three';

/** Dense voxel grid. Colour 0 = empty; colours are 0xRRGGBB (use 0x010101 for black). */
export class VoxelGrid {
  readonly data: Uint32Array;
  constructor(readonly sx: number, readonly sy: number, readonly sz: number) {
    this.data = new Uint32Array(sx * sy * sz);
  }
  private idx(x: number, y: number, z: number): number {
    return x + this.sx * (y + this.sy * z);
  }
  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }
  set(x: number, y: number, z: number, color: number): void {
    if (this.inside(x, y, z)) this.data[this.idx(x, y, z)] = color;
  }
  get(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? this.data[this.idx(x, y, z)] : 0;
  }
  fillBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): void {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, color);
  }
  /** Copy the left half (x < sx/2) onto the right half. */
  mirrorX(): void {
    for (let z = 0; z < this.sz; z++)
      for (let y = 0; y < this.sy; y++)
        for (let x = 0; x < Math.floor(this.sx / 2); x++) this.set(this.sx - 1 - x, y, z, this.get(x, y, z));
  }
}

// Face definitions: normal, 4 corners (unit cube), shade factor baked in vertex colour.
const FACES: { n: [number, number, number]; c: [number, number, number][]; shade: number }[] = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.8 },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.8 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55 },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.7 },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.9 },
];

/** Mesh only visible faces, vertex colours, centred on the origin. Grid z=0 is the front (−Z). */
export function buildGeometry(grid: VoxelGrid, voxelSize: number): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], ind: number[] = [];
  const ox = grid.sx / 2, oy = grid.sy / 2, oz = grid.sz / 2;
  const tmp = new THREE.Color();
  for (let z = 0; z < grid.sz; z++)
    for (let y = 0; y < grid.sy; y++)
      for (let x = 0; x < grid.sx; x++) {
        const c = grid.get(x, y, z);
        if (!c) continue;
        tmp.setHex(c, THREE.SRGBColorSpace);
        for (const f of FACES) {
          if (grid.get(x + f.n[0], y + f.n[1], z + f.n[2])) continue;
          const base = pos.length / 3;
          for (const v of f.c) {
            pos.push((x + v[0] - ox) * voxelSize, (y + v[1] - oy) * voxelSize, (z + v[2] - oz) * voxelSize);
            nor.push(f.n[0], f.n[1], f.n[2]);
            col.push(tmp.r * f.shade, tmp.g * f.shade, tmp.b * f.shade);
          }
          ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(ind);
  return geo;
}
