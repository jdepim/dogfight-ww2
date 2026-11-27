import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Game } from '../../src/game/game';
import { generateWorld } from '../../src/world/cityGen';
import { makeRng } from '../../src/core/rng';
import { forwardOf } from '../../src/flight/flightModel';
import { createEnemy } from '../../src/ai/enemyAI';
import { NEUTRAL_INPUT } from '../../src/input/types';
import { CONFIG } from '../../src/config';

const DT = CONFIG.sim.step;

function newGame() {
  const g = new Game(generateWorld(CONFIG.world.seed), makeRng(5), undefined);
  g.start();
  return g;
}

/** Put the player in level flight at a safe place. */
function fly(g: Game, pos = new THREE.Vector3(-800, 600, 1200), speed = 110) {
  const f = g.player.flight;
  f.onGround = false;
  f.position.copy(pos);
  f.orientation.identity();
  f.velocity.copy(forwardOf(f)).multiplyScalar(speed);
  f.speed = speed;
  f.throttle = 0.35;
}

function steps(g: Game, seconds: number, keepAlive = true) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (keepAlive && g.phase !== 'gameover') { g.player.damage.hp = 100; g.player.resources.fuel = 200; if (g.player.flight.position.y < 300) fly(g); }
    g.step(NEUTRAL_INPUT, DT);
  }
}

describe('Game', () => {
  it('starts in preflight on the runway', () => {
    const g = newGame();
    expect(g.phase).toBe('preflight');
    expect(g.player.flight.onGround).toBe(true);
    expect(g.wave).toBe(0);
  });

  it('take-off starts wave 1 with enemies spawned far from the player', () => {
    const g = newGame();
    fly(g, new THREE.Vector3(-1500, 50, 200), 60);
    g.step(NEUTRAL_INPUT, DT);
    expect(g.phase).toBe('wave');
    expect(g.wave).toBe(1);
    expect(g.enemies.length).toBe(2);
    for (const e of g.enemies) expect(e.flight.position.distanceTo(g.player.flight.position)).toBeGreaterThan(1500);
  });

  it('clearing a wave gives kill points, a 30 s break, then the next wave with a non-stop bonus', () => {
    const g = newGame();
    fly(g); g.step(NEUTRAL_INPUT, DT);
    for (const e of g.enemies) e.damage.hp = 0;
    g.step(NEUTRAL_INPUT, DT);
    expect(g.score.kills).toBe(2);
    expect(g.score.points).toBe(200);
    expect(g.phase).toBe('break');
    expect(g.breakTimeLeft).toBeGreaterThan(29);
    steps(g, 30.2);
    expect(g.phase).toBe('wave');
    expect(g.wave).toBe(2);
    expect(g.enemies.length).toBe(3);
    expect(g.score.nonStopWaves).toBe(1);
    expect(g.score.points).toBe(200 + 250);
  });

  it('refuels, rearms and repairs when stopped on the runway, and then no non-stop bonus', () => {
    const g = newGame();
    fly(g); g.step(NEUTRAL_INPUT, DT);
    for (const e of g.enemies) e.damage.hp = 0;
    g.step(NEUTRAL_INPUT, DT);
    const f = g.player.flight, rw = g.layout.runway;
    f.onGround = true; f.position.set(rw.center.x, CONFIG.flight.groundClearance, rw.center.z); f.velocity.set(0, 0, 0); f.speed = 0; f.throttle = 0;
    g.player.resources.fuel = 10; g.player.resources.ammo = 0; g.player.damage.hp = 40;
    for (let i = 0; i < Math.round(5.1 / DT); i++) g.step(NEUTRAL_INPUT, DT);
    expect(g.player.resources.fuel).toBeCloseTo(CONFIG.resources.fuelSeconds, 0);
    expect(g.player.resources.ammo).toBe(CONFIG.resources.ammo);
    expect(g.player.damage.hp).toBe(100);
    for (let i = 0; i < Math.round(26 / DT); i++) g.step(NEUTRAL_INPUT, DT);
    expect(g.wave).toBe(2);
    expect(g.score.nonStopWaves).toBe(0);
  });

  it('a bomber over the runway destroys it until the end of the next wave', () => {
    const g = newGame();
    fly(g); g.step(NEUTRAL_INPUT, DT);
    const rw = g.layout.runway;
    g.enemies.push(createEnemy(99, 'bomber', new THREE.Vector3(rw.center.x, 250, rw.center.z), 0, 0.5));
    g.step(NEUTRAL_INPUT, DT);
    expect(g.events.some((e) => e.type === 'runwayDestroyed')).toBe(true);
    expect(rw.destroyedUntilWave).toBe(g.wave + 1);
  });

  it('ends the game when shot down', () => {
    const g = newGame();
    fly(g); g.step(NEUTRAL_INPUT, DT);
    g.player.damage.hp = 0;
    g.step(NEUTRAL_INPUT, DT);
    expect(g.phase).toBe('gameover');
    expect(g.lastDeathReason).toBe('Abattu');
  });

  it('ends the game when flying into a building', () => {
    const g = newGame();
    const b = g.layout.buildings.find((x) => x.style === 'tower')!;
    fly(g, new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y / 2, b.max.z + 4));
    g.step(NEUTRAL_INPUT, DT);
    expect(g.phase).toBe('gameover');
    expect(g.lastDeathReason).toBe('Collision avec un immeuble');
  });

  it('ends the game when hitting the ground away from the runway', () => {
    const g = newGame();
    fly(g, new THREE.Vector3(1000, CONFIG.flight.groundClearance, 1900), 120);
    g.player.flight.velocity.y = -10;
    g.step(NEUTRAL_INPUT, DT);
    expect(g.phase).toBe('gameover');
    expect(g.lastDeathReason).toBe('Écrasé au sol');
  });

  it('ends the game when running out of fuel in flight', () => {
    const g = newGame();
    fly(g); g.step(NEUTRAL_INPUT, DT);
    g.player.resources.fuel = 0;
    g.step(NEUTRAL_INPUT, DT);
    expect(g.phase).toBe('gameover');
    expect(g.lastDeathReason).toBe('Panne sèche');
  });

  it('turns the player back towards the map when beyond the edge', () => {
    const g = newGame();
    const h = CONFIG.world.size / 2;
    fly(g, new THREE.Vector3(h + 20, 600, 0));
    g.player.flight.orientation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2); // heading east (+X)
    g.player.flight.velocity.set(110, 0, 0);
    for (let i = 0; i < Math.round(6 / DT); i++) { g.player.resources.fuel = 200; g.step(NEUTRAL_INPUT, DT); }
    expect(g.player.flight.velocity.x).toBeLessThan(0);
  });

  it('counts shots and hits when the player shoots an enemy', () => {
    const g = newGame();
    fly(g); g.step(NEUTRAL_INPUT, DT);
    const target = g.enemies[0];
    const f = g.player.flight;
    target.flight.position.copy(f.position).addScaledVector(forwardOf(f), 150);
    target.flight.velocity.copy(f.velocity);
    for (let i = 0; i < 30; i++) {
      target.flight.position.copy(f.position).addScaledVector(forwardOf(f), 150);
      g.step({ ...NEUTRAL_INPUT, fire: true }, DT);
    }
    expect(g.score.shots).toBeGreaterThan(0);
    expect(g.score.hits).toBeGreaterThan(0);
    expect(target.damage.hp).toBeLessThan(100);
  });

  it('pause freezes the simulation and resume restores the phase', () => {
    const g = newGame();
    fly(g); g.step(NEUTRAL_INPUT, DT);
    const z = g.player.flight.position.z;
    g.pause();
    expect(g.phase).toBe('paused');
    g.step(NEUTRAL_INPUT, DT);
    expect(g.player.flight.position.z).toBe(z);
    g.resume();
    expect(g.phase).toBe('wave');
  });
});
