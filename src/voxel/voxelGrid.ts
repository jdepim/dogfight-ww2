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

// Shade baked in vertex colour per face normal: [+axis, -axis] for x, y, z.
const SHADE: [number, number][] = [[0.8, 0.8], [1.0, 0.55], [0.7, 0.9]];

/**
 * Greedy-meshed geometry: visible faces only, coplanar same-colour faces merged into rectangles.
 * Vertex colours, centred on the origin. Grid z=0 is the front (−Z).
 */
export function buildGeometry(grid: VoxelGrid, voxelSize: number): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], ind: number[] = [];
  const dims = [grid.sx, grid.sy, grid.sz];
  const off = [grid.sx / 2, grid.sy / 2, grid.sz / 2];
  const tmp = new THREE.Color();
  const at = (c: number[]) => grid.get(c[0], c[1], c[2]);

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const nu = dims[u], nv = dims[v];
    const mask = new Float64Array(nu * nv);
    const x = [0, 0, 0];
    for (x[d] = 0; x[d] <= dims[d]; x[d]++) {
      // Build mask: key = colour * 2 + (1 for +d face, 0 for -d face) + 1 (0 = nothing)
      for (x[v] = 0; x[v] < nv; x[v]++)
        for (x[u] = 0; x[u] < nu; x[u]++) {
          const behind = x[d] > 0 ? at([x[0] - (d === 0 ? 1 : 0), x[1] - (d === 1 ? 1 : 0), x[2] - (d === 2 ? 1 : 0)]) : 0;
          const front = x[d] < dims[d] ? at(x) : 0;
          let key = 0;
          if (behind && !front) key = behind * 2 + 1 + 1;
          else if (front && !behind) key = front * 2 + 0 + 1;
          mask[x[u] + x[v] * nu] = key;
        }
      // Greedy merge
      for (let j = 0; j < nv; j++)
        for (let i = 0; i < nu; ) {
          const key = mask[i + j * nu];
          if (!key) { i++; continue; }
          let w = 1;
          while (i + w < nu && mask[i + w + j * nu] === key) w++;
          let h = 1;
          outer: for (; j + h < nv; h++)
            for (let k = 0; k < w; k++) if (mask[i + k + (j + h) * nu] !== key) break outer;
          for (let hh = 0; hh < h; hh++) for (let k = 0; k < w; k++) mask[i + k + (j + hh) * nu] = 0;

          const positive = (key - 1) % 2 === 1;
          const color = Math.floor((key - 1) / 2);
          const shade = SHADE[d][positive ? 0 : 1];
          tmp.setHex(color, THREE.SRGBColorSpace);
          const base = [0, 0, 0]; base[d] = x[d]; base[u] = i; base[v] = j;
          const du = [0, 0, 0]; du[u] = w;
          const dv = [0, 0, 0]; dv[v] = h;
          const corners = [
            base,
            [base[0] + du[0], base[1] + du[1], base[2] + du[2]],
            [base[0] + du[0] + dv[0], base[1] + du[1] + dv[1], base[2] + du[2] + dv[2]],
            [base[0] + dv[0], base[1] + dv[1], base[2] + dv[2]],
          ];
          const order = positive ? [0, 1, 2, 3] : [0, 3, 2, 1];
          const n = [0, 0, 0]; n[d] = positive ? 1 : -1;
          const b = pos.length / 3;
          for (const o of order) {
            const c = corners[o];
            pos.push((c[0] - off[0]) * voxelSize, (c[1] - off[1]) * voxelSize, (c[2] - off[2]) * voxelSize);
            nor.push(n[0], n[1], n[2]);
            col.push(tmp.r * shade, tmp.g * shade, tmp.b * shade);
          }
          ind.push(b, b + 1, b + 2, b, b + 2, b + 3);
          i += w;
        }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(ind);
  return geo;
}
