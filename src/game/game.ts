import * as THREE from 'three';
import { CONFIG } from '../config';
import type { FlightInput } from '../input/types';
import { createFlightState, forwardOf, stepFlight, type FlightState } from '../flight/flightModel';
import { applyHit, createDamage, isDestroyed, modifiersFrom, zoneFromLocalHit, type DamageState } from '../flight/damage';
import { consume, createResources, refuel, tickGun, tryFire, type Resources } from '../flight/resources';
import { BulletPool, leadPoint, type HitTarget } from '../combat/ballistics';
import { CollisionWorld, outOfBounds } from '../world/collision';
import { checkTouchdown, gearDown, inRefuelZone } from '../world/airfield';
import type { WorldLayout } from '../world/cityGen';
import { createEnemy, steerTo, thinkEnemy, type Enemy } from '../ai/enemyAI';
import { waveComposition } from './waves';
import { createScore, loadBest, saveBest, type ScoreState } from './score';

export type Phase = 'menu' | 'preflight' | 'wave' | 'break' | 'paused' | 'gameover';

export type GameEvent = {
  type: 'hit' | 'kill' | 'explosion' | 'landed' | 'crash' | 'waveStart' | 'waveCleared' | 'runwayDestroyed' | 'fire' | 'spawn' | 'despawn';
  position?: THREE.Vector3;
  id?: number;
};

export const PLAYER_ID = 0;

const _inv = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** Owns the whole simulation: phases, player, enemies, bullets, score. No rendering. */
export class Game {
  phase: Phase = 'menu';
  wave = 0;
  breakTimeLeft = 0;
  player!: { flight: FlightState; damage: DamageState; resources: Resources };
  enemies: Enemy[] = [];
  readonly bullets = new BulletPool();
  score: ScoreState = createScore();
  best: number;
  newRecord = false;
  lastDeathReason?: string;
  events: GameEvent[] = [];
  readonly world: CollisionWorld;
  private resumePhase: Phase = 'menu';
  private landedThisBreak = false;
  private nextId = 1;
  private boundsForce = false;

  constructor(readonly layout: WorldLayout, private rng: () => number, private storage: Storage | undefined = undefined) {
    this.world = new CollisionWorld(layout.buildings);
    this.best = loadBest(this.storageOrDefault());
    this.resetPlayer();
  }

  private storageOrDefault(): Storage | undefined {
    if (this.storage) return this.storage;
    try { return globalThis.localStorage; } catch { return undefined; }
  }

  private resetPlayer(): void {
    const rw = this.layout.runway;
    const start = new THREE.Vector3(rw.center.x, CONFIG.flight.groundClearance, rw.center.z + rw.length / 2 - 30);
    this.player = { flight: createFlightState(start, rw.headingRad, true), damage: createDamage(), resources: createResources() };
  }

  start(): void {
    for (const e of this.enemies) this.events.push({ type: 'despawn', id: e.id });
    this.resetPlayer();
    this.enemies = [];
    this.bullets.clear();
    this.score = createScore();
    this.wave = 0;
    this.breakTimeLeft = 0;
    this.lastDeathReason = undefined;
    this.newRecord = false;
    this.layout.runway.destroyedUntilWave = 0;
    this.phase = 'preflight';
    this.boundsForce = false;
  }

  pause(): void {
    if (this.phase === 'paused' || this.phase === 'menu' || this.phase === 'gameover') return;
    this.resumePhase = this.phase;
    this.phase = 'paused';
  }

  resume(): void {
    if (this.phase === 'paused') this.phase = this.resumePhase;
  }

  get runwayDestroyed(): boolean {
    return this.layout.runway.destroyedUntilWave >= Math.max(1, this.wave);
  }

  get boundsState(): 'ok' | 'warn' | 'force' {
    return outOfBounds(this.player.flight.position, CONFIG.world.size);
  }

  step(input: FlightInput, dt: number): void {
    this.events = [];
    if (this.phase === 'menu' || this.phase === 'paused' || this.phase === 'gameover') return;
    this.stepPlayer(input, dt);
    if ((this.phase as Phase) === 'gameover') return;
    this.stepEnemies(dt);
    this.stepBullets(dt);
    this.stepWaves(dt);
  }

  // ---------------------------------------------------------------- player
  private stepPlayer(input: FlightInput, dt: number): void {
    const p = this.player, f = p.flight;
    let cmd = input;
    const bounds = this.boundsState;
    if (bounds === 'force') this.boundsForce = true;
    else if (bounds === 'ok') this.boundsForce = false;
    if (this.boundsForce && !f.onGround) {
      const st = steerTo(f, new THREE.Vector3(0, Math.min(Math.max(f.position.y, 300), CONFIG.world.ceiling * 0.8), 0));
      cmd = { ...input, pitch: st.pitch, roll: st.roll, yaw: st.yaw };
    }

    const hasFuel = p.resources.fuel > 0;
    stepFlight(f, cmd, modifiersFrom(p.damage), hasFuel, dt);
    consume(p.resources, f.throttle, p.damage, dt);

    if (input.fire && tryFire(p.resources, dt)) {
      const fwd = forwardOf(f);
      this.bullets.spawn(f.position.clone().addScaledVector(fwd, 5), fwd, f.velocity, PLAYER_ID);
      this.score.shots++;
      this.events.push({ type: 'fire', id: PLAYER_ID });
    } else if (!input.fire) tickGun(p.resources, dt);

    if (this.phase === 'preflight' && !f.onGround) this.startWave(1);

    if (!f.onGround) {
      const td = checkTouchdown(f, this.layout.runway, Math.max(1, this.wave));
      if (td.result === 'landed') {
        f.onGround = true;
        f.velocity.y = 0;
        f.position.y = CONFIG.flight.groundClearance;
        if (this.phase === 'break') this.landedThisBreak = true;
        this.events.push({ type: 'landed', position: f.position.clone() });
      } else if (td.result === 'crash') {
        const reason = td.reason === 'Hors piste' && !gearDown(f, this.layout.runway) ? 'Écrasé au sol' : td.reason!;
        return this.die(reason);
      }
      if (this.world.sphereHits(f.position, CONFIG.combat.collisionRadius)) return this.die('Collision avec un immeuble');
      if (p.resources.fuel <= 0) return this.die('Panne sèche');
    } else {
      if (this.phase === 'break') this.landedThisBreak = true;
      if (f.speed < 1 && inRefuelZone(f, this.layout.runway) && !this.runwayDestroyed) refuel(p.resources, p.damage, dt);
    }
    if (isDestroyed(p.damage)) return this.die('Abattu');
  }

  private die(reason: string): void {
    this.lastDeathReason = reason;
    this.phase = 'gameover';
    this.events.push({ type: 'crash', position: this.player.flight.position.clone(), id: PLAYER_ID });
    this.events.push({ type: 'explosion', position: this.player.flight.position.clone(), id: PLAYER_ID });
    this.newRecord = saveBest(this.score.points, this.storageOrDefault());
    this.best = Math.max(this.best, this.score.points);
  }

  // ---------------------------------------------------------------- enemies
  private stepEnemies(dt: number): void {
    const C = CONFIG.combat;
    const pf = this.player.flight;
    const rw = this.layout.runway;
    for (const e of this.enemies) {
      const cmd = thinkEnemy(e, pf, this.world, rw, this.rng);
      stepFlight(e.flight, cmd, modifiersFrom(e.damage), true, dt);
      const f = e.flight;
      if (cmd.fire && tryFire(e.resources, dt)) {
        e.resources.ammo = Math.max(e.resources.ammo, 50); // enemies never run dry
        if (e.kind === 'fighter') {
          const fwd = forwardOf(f);
          this.bullets.spawn(f.position.clone().addScaledVector(fwd, 5), fwd, f.velocity, e.id);
        } else {
          const tail = f.position.clone().addScaledVector(forwardOf(f), -10);
          const aim = leadPoint(tail, f.velocity, pf.position, pf.velocity, CONFIG.bullets.speed) ?? pf.position.clone();
          const err = (1 - e.ai.skill) * 0.08 + 0.02;
          const dir = aim.sub(tail).normalize().add(new THREE.Vector3((this.rng() - 0.5) * err, (this.rng() - 0.5) * err, (this.rng() - 0.5) * err)).normalize();
          this.bullets.spawn(tail, dir, f.velocity, e.id);
        }
        this.events.push({ type: 'fire', id: e.id });
      } else if (!cmd.fire) tickGun(e.resources, dt);

      if (e.kind === 'bomber' && !this.runwayDestroyed) {
        const d = Math.hypot(f.position.x - rw.center.x, f.position.z - rw.center.z);
        if (d < C.bombRadius) {
          rw.destroyedUntilWave = this.wave + 1;
          this.events.push({ type: 'runwayDestroyed', position: rw.center.clone() });
          this.events.push({ type: 'explosion', position: rw.center.clone().setY(2) });
        }
      }
      if (f.position.y <= CONFIG.flight.groundClearance || this.world.sphereHits(f.position, C.collisionRadius)) e.damage.hp = 0;
    }
    this.removeDestroyed();
  }

  private removeDestroyed(): void {
    const alive: Enemy[] = [];
    for (const e of this.enemies) {
      if (isDestroyed(e.damage)) {
        this.score.kills++;
        this.score.points += CONFIG.score.killPerWave * Math.max(1, this.wave);
        this.events.push({ type: 'kill', id: e.id, position: e.flight.position.clone() });
        this.events.push({ type: 'explosion', id: e.id, position: e.flight.position.clone() });
        this.events.push({ type: 'despawn', id: e.id });
      } else alive.push(e);
    }
    this.enemies = alive;
  }

  // ---------------------------------------------------------------- bullets
  private stepBullets(dt: number): void {
    const C = CONFIG.combat;
    const targets: HitTarget[] = [{ id: PLAYER_ID, position: this.player.flight.position, radius: C.planeRadius }];
    for (const e of this.enemies) targets.push({ id: e.id, position: e.flight.position, radius: e.kind === 'bomber' ? C.bomberRadius : C.planeRadius });
    this.bullets.step(dt, this.world, targets, (b, t, point) => {
      if (t.id === PLAYER_ID) {
        if (b.ownerId === PLAYER_ID) return;
        this.hitPlane(this.player.flight, this.player.damage, point, C.hitOnPlayer);
      } else {
        const e = this.enemies.find((x) => x.id === t.id);
        if (!e) return;
        if (b.ownerId !== PLAYER_ID) return; // no friendly fire between enemies
        this.hitPlane(e.flight, e.damage, point, e.kind === 'bomber' ? C.hitOnBomber : C.hitOnFighter);
        this.score.hits++;
      }
      this.events.push({ type: 'hit', id: t.id, position: point });
    });
    this.removeDestroyed();
    if (isDestroyed(this.player.damage)) this.die('Abattu');
  }

  private hitPlane(f: FlightState, d: DamageState, point: THREE.Vector3, amount: number): void {
    _inv.copy(f.orientation).invert();
    _v.subVectors(point, f.position).applyQuaternion(_inv);
    applyHit(d, zoneFromLocalHit(_v), amount);
  }

  // ---------------------------------------------------------------- waves
  private stepWaves(dt: number): void {
    if (this.phase === 'wave' && this.enemies.length === 0) {
      this.phase = 'break';
      this.breakTimeLeft = CONFIG.waves.pauseSeconds;
      this.landedThisBreak = this.player.flight.onGround;
      this.events.push({ type: 'waveCleared' });
    } else if (this.phase === 'break') {
      this.breakTimeLeft -= dt;
      if (this.breakTimeLeft <= 0) {
        if (!this.landedThisBreak) {
          this.score.nonStopWaves++;
          this.score.points += CONFIG.score.nonStopPerWave * this.wave;
        }
        this.startWave(this.wave + 1);
      }
    }
  }

  private startWave(n: number): void {
    this.wave = n;
    this.phase = 'wave';
    const comp = waveComposition(n);
    const pp = this.player.flight.position;
    const base = Math.atan2(pp.z, pp.x) + Math.PI;
    const ring = this.layout.spawnRing;
    const spawnGroup = (kind: 'fighter' | 'bomber', count: number, angle: number, alt: number) => {
      for (let i = 0; i < count; i++) {
        let pos = new THREE.Vector3(Math.cos(angle) * ring, alt, Math.sin(angle) * ring);
        pos.add(new THREE.Vector3((this.rng() - 0.5) * 300, (this.rng() - 0.5) * 100, (this.rng() - 0.5) * 300));
        if (pos.distanceTo(pp) < 1600) pos = pos.sub(pp).setLength(1600).add(pp).setY(alt);
        const heading = Math.atan2(-pos.x, pos.z); // face the map centre
        const e = createEnemy(this.nextId++, kind, pos, heading, comp.skill);
        e.flight.velocity.copy(forwardOf(e.flight)).multiplyScalar(kind === 'bomber' ? 90 : 110);
        e.flight.speed = e.flight.velocity.length();
        this.enemies.push(e);
        this.events.push({ type: 'spawn', id: e.id });
      }
    };
    spawnGroup('fighter', comp.fighters, base + (this.rng() - 0.5) * 1.2, 400);
    if (comp.bombers) {
      const a = base + (this.rng() < 0.5 ? 0.9 : -0.9);
      spawnGroup('bomber', comp.bombers, a, 250);
      spawnGroup('fighter', comp.escorts, a, 330);
    }
    this.events.push({ type: 'waveStart' });
  }
}
