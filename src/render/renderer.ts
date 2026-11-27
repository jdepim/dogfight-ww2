import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldLayout } from '../world/cityGen';
import type { Bullet } from '../combat/ballistics';
import { buildGeometry } from '../voxel/voxelGrid';
import { BOMBER_PROPS, PROPELLER_ANCHOR, VOXEL_SIZE, makeBomber, makeBuilding, makeEnemyFighter, makePlayerFighter } from '../voxel/models';

export type PlaneKind = 'player' | 'enemy' | 'bomber';

const SKY = 0x9cc4e4;
const CHUNK = 500;
const MAX_PARTICLES = 600;

interface Particle { pos: THREE.Vector3; vel: THREE.Vector3; life: number; maxLife: number; size: number; color: THREE.Color; grow: number }
interface PlaneView { root: THREE.Object3D; props: THREE.Object3D[]; prevPos: THREE.Vector3; prevQuat: THREE.Quaternion; curPos: THREE.Vector3; curQuat: THREE.Quaternion; smokeAcc: number }

/** Owns the three.js scene. Simulation entities are pushed in each frame; nothing here affects gameplay. */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private planes = new Map<number, PlaneView>();
  private planeGeo: Record<PlaneKind, THREE.BufferGeometry>;
  private planeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private propGeo = new THREE.BoxGeometry(2.6, 0.18, 0.08);
  private propMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.55 });
  private bulletMesh: THREE.InstancedMesh;
  private particleMesh: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private runwayDamage: THREE.Mesh;
  private _m = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  private _s = new THREE.Vector3();
  private _p = new THREE.Vector3();
  private _c = new THREE.Color();

  constructor(canvas: HTMLCanvasElement, layout: WorldLayout) {
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.75));
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 700, 2200);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a6b45, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
    sun.position.set(0.5, 1, 0.3);
    this.scene.add(sun);

    this.buildGround(layout);
    this.buildCity(layout);
    this.runwayDamage = this.buildRunway(layout);

    this.planeGeo = {
      player: buildGeometry(makePlayerFighter(), VOXEL_SIZE.plane),
      enemy: buildGeometry(makeEnemyFighter(), VOXEL_SIZE.plane),
      bomber: buildGeometry(makeBomber(), VOXEL_SIZE.bomber),
    };

    this.bulletMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.25, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 512);
    this.bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bulletMesh.frustumCulled = false;
    this.bulletMesh.count = 0;
    this.scene.add(this.bulletMesh);

    this.particleMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_PARTICLES);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.count = 0;
    this.scene.add(this.particleMesh);
  }

  private buildGround(layout: WorldLayout): void {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ color: 0x6f9a4c }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const city = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1500), new THREE.MeshLambertMaterial({ color: 0x77736c }));
    city.rotation.x = -Math.PI / 2;
    city.position.y = 0.05;
    this.scene.add(city);
    // Fields: a few large coloured patches merged in one mesh.
    const patches: THREE.BufferGeometry[] = [];
    const colors = [0x8aa65a, 0x9c9a4e, 0x5f8a43, 0xa48f5a];
    let n = 0;
    for (let x = -1950; x < 1950; x += 300)
      for (let z = -1950; z < 1950; z += 300) {
        n++;
        if (Math.abs(x) < 900 && Math.abs(z) < 900) continue;
        if (Math.abs(x - layout.runway.center.x) < 200 && Math.abs(z) < 700) continue;
        if ((n * 7919) % 3 !== 0) continue;
        const g = new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2).translate(x + 150, 0.03, z + 150);
        const c = new THREE.Color(colors[n % colors.length]);
        const cols = new Float32Array(g.getAttribute('position').count * 3).map((_, i) => [c.r, c.g, c.b][i % 3]);
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        patches.push(g);
      }
    if (patches.length) this.scene.add(new THREE.Mesh(mergeGeometries(patches), new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  private buildCity(layout: WorldLayout): void {
    const chunks = new Map<string, THREE.BufferGeometry[]>();
    for (const b of layout.buildings) {
      const vs = b.style === 'tower' ? VOXEL_SIZE.tower : VOXEL_SIZE.house;
      const w = Math.round((b.max.x - b.min.x) / vs), d = Math.round((b.max.z - b.min.z) / vs);
      let grid;
      if (b.style === 'tower') grid = makeBuilding(w, Math.round(b.max.y / vs), d, 'tower', b.seed);
      else {
        const roofRows = Math.ceil(Math.min(w, d) / 2);
        const wallRows = Math.max(2, Math.round(b.max.y / vs - roofRows / 2));
        grid = makeBuilding(w, wallRows, d, 'house', b.seed);
      }
      const geo = buildGeometry(grid, vs);
      geo.translate((b.min.x + b.max.x) / 2, (grid.sy * vs) / 2, (b.min.z + b.max.z) / 2);
      const key = `${Math.floor(b.min.x / CHUNK)},${Math.floor(b.min.z / CHUNK)}`;
      (chunks.get(key) ?? chunks.set(key, []).get(key)!).push(geo);
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const list of chunks.values()) {
      const merged = mergeGeometries(list);
      merged.computeBoundingSphere();
      this.scene.add(new THREE.Mesh(merged, mat));
      list.forEach((g) => g.dispose());
    }
  }

  private buildRunway(layout: WorldLayout): THREE.Mesh {
    const rw = layout.runway;
    const group = new THREE.Group();
    const strip = new THREE.Mesh(new THREE.BoxGeometry(rw.width, 0.2, rw.length), new THREE.MeshLambertMaterial({ color: 0x3d3d3d }));
    group.add(strip);
    const dashGeo: THREE.BufferGeometry[] = [];
    for (let z = -rw.length / 2 + 20; z < rw.length / 2 - 20; z += 40) dashGeo.push(new THREE.BoxGeometry(1.2, 0.25, 18).translate(0, 0.05, z));
    for (const s of [-1, 1]) for (let i = -3; i <= 3; i++) dashGeo.push(new THREE.BoxGeometry(2, 0.25, 12).translate(i * 4.5, 0.05, s * (rw.length / 2 - 10)));
    group.add(new THREE.Mesh(mergeGeometries(dashGeo), new THREE.MeshLambertMaterial({ color: 0xeeeeee })));
    // Hangar and tower (decor only, kept clear of the strip)
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 40), new THREE.MeshLambertMaterial({ color: 0x7d7a6a }));
    hangar.position.set(-60, 6, -100);
    group.add(hangar);
    const damage = new THREE.Mesh(new THREE.BoxGeometry(rw.width + 6, 0.4, rw.length * 0.6), new THREE.MeshLambertMaterial({ color: 0x1d1a16 }));
    damage.visible = false;
    group.add(damage);
    group.position.copy(rw.center).setY(0.1);
    group.rotation.y = -rw.headingRad;
    this.scene.add(group);
    return damage;
  }

  setRunwayDestroyed(v: boolean): void {
    this.runwayDamage.visible = v;
  }

  addPlane(id: number, kind: PlaneKind): void {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(this.planeGeo[kind], this.planeMat));
    const anchors = kind === 'bomber' ? BOMBER_PROPS : [PROPELLER_ANCHOR[kind]];
    const props = anchors.map((a) => {
      const p = new THREE.Mesh(this.propGeo, this.propMat);
      p.position.set(a[0], a[1], a[2] - 0.1);
      root.add(p);
      return p;
    });
    this.scene.add(root);
    this.planes.set(id, { root, props, prevPos: new THREE.Vector3(), prevQuat: new THREE.Quaternion(), curPos: new THREE.Vector3(), curQuat: new THREE.Quaternion(), smokeAcc: 0 });
  }

  removePlane(id: number): void {
    const v = this.planes.get(id);
    if (!v) return;
    this.scene.remove(v.root);
    this.planes.delete(id);
  }

  hasPlane(id: number): boolean {
    return this.planes.has(id);
  }

  /** Record the latest simulated pose; call once per simulation step. `snap` skips interpolation (spawn/teleport). */
  pushPose(id: number, pos: THREE.Vector3, quat: THREE.Quaternion, snap = false): void {
    const v = this.planes.get(id);
    if (!v) return;
    if (snap) { v.prevPos.copy(pos); v.prevQuat.copy(quat); }
    else { v.prevPos.copy(v.curPos); v.prevQuat.copy(v.curQuat); }
    v.curPos.copy(pos);
    v.curQuat.copy(quat);
  }

  /** Interpolate every plane between its last two poses. Returns interpolated pose for camera use. */
  syncPlanes(alpha: number, throttles: Map<number, number>, dt: number): void {
    for (const [id, v] of this.planes) {
      v.root.position.lerpVectors(v.prevPos, v.curPos, alpha);
      v.root.quaternion.slerpQuaternions(v.prevQuat, v.curQuat, alpha);
      const spin = 20 + 60 * (throttles.get(id) ?? 0.5);
      for (const p of v.props) p.rotation.z += spin * dt;
    }
  }

  planePose(id: number): { position: THREE.Vector3; orientation: THREE.Quaternion } | null {
    const v = this.planes.get(id);
    return v ? { position: v.root.position, orientation: v.root.quaternion } : null;
  }

  setBullets(bullets: readonly Bullet[]): void {
    let n = 0;
    for (const b of bullets) {
      if (!b.alive) continue;
      this._p.copy(b.vel).normalize();
      this._q.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this._p);
      const s = b.tracer ? 1.6 : 0.6;
      this._s.set(s, s, b.tracer ? 2 : 1);
      this._m.compose(b.pos, this._q, this._s);
      this.bulletMesh.setMatrixAt(n, this._m);
      this.bulletMesh.setColorAt(n, this._c.setHex(b.tracer ? 0xffd040 : 0xfff4c0));
      n++;
    }
    this.bulletMesh.count = n;
    this.bulletMesh.instanceMatrix.needsUpdate = true;
    if (this.bulletMesh.instanceColor) this.bulletMesh.instanceColor.needsUpdate = true;
  }

  private emit(pos: THREE.Vector3, vel: THREE.Vector3, life: number, size: number, color: number, grow: number): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ pos: pos.clone(), vel: vel.clone(), life, maxLife: life, size, color: new THREE.Color(color), grow });
  }

  spawnExplosion(p: THREE.Vector3, big = false): void {
    const n = big ? 60 : 36;
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      const fire = i % 3 !== 0;
      this.emit(p, dir.multiplyScalar(8 + Math.random() * (big ? 30 : 18)), 0.8 + Math.random() * 1.2, (big ? 3 : 2) + Math.random() * 2,
        fire ? (Math.random() < 0.5 ? 0xffa020 : 0xffe060) : 0x3a3a3a, fire ? -1 : 2.5);
    }
  }

  spawnHitSpark(p: THREE.Vector3): void {
    for (let i = 0; i < 5; i++)
      this.emit(p, new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(20), 0.25, 0.6, 0xffe080, -1);
  }

  /** Damage smoke trail; intensity 0..1. Call each frame. */
  spawnSmoke(id: number, intensity: number, dt: number): void {
    const v = this.planes.get(id);
    if (!v || intensity <= 0.05) return;
    v.smokeAcc += dt * (10 + 30 * intensity);
    while (v.smokeAcc >= 1) {
      v.smokeAcc -= 1;
      const shade = intensity > 0.6 ? 0x262626 : 0x707070;
      // Emit behind the plane so the trail never blocks the chase camera.
      const back = this._p.set(0, 0, 4).applyQuaternion(v.root.quaternion).add(v.root.position);
      this.emit(back, new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2), 1 + intensity * 1.5, 0.5 + intensity * 0.8, shade, 1.2);
    }
  }

  private updateParticles(dt: number): void {
    let n = 0;
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.pos.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.exp(-1.5 * dt));
      const t = p.life / p.maxLife;
      const s = Math.max(0.05, p.size * (p.grow > 0 ? 1 + (1 - t) * p.grow : t));
      this._m.compose(p.pos, this._q.identity(), this._s.set(s, s, s));
      this.particleMesh.setMatrixAt(n, this._m);
      this.particleMesh.setColorAt(n, p.color);
      n++;
    }
    this.particleMesh.count = n;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  resize(w: number, h: number, cam: THREE.PerspectiveCamera): void {
    this.renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }

  render(camera: THREE.Camera, dt: number): void {
    this.updateParticles(dt);
    this.renderer.render(this.scene, camera);
  }

  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }
}
