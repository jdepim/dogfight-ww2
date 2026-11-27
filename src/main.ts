import * as THREE from 'three';
import { CONFIG } from './config';
import { FixedLoop } from './core/loop';
import { makeRng } from './core/rng';
import { generateWorld } from './world/cityGen';
import { InputManager } from './input/inputManager';
import { GameRenderer } from './render/renderer';
import { chaseCamera } from './render/camera';
import { Game, PLAYER_ID, type GameEvent } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const layout = generateWorld(CONFIG.world.seed);
const game = new Game(layout, makeRng(Date.now() & 0xffff));
const renderer = new GameRenderer(canvas, layout);
const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 4000);
const input = new InputManager(canvas, ui);
let cameraMode: 'chase' | 'target' = 'chase';
input.onCameraToggle = () => { cameraMode = cameraMode === 'chase' ? 'target' : 'chase'; };
input.onPauseRequest = () => game.pause();

const info = document.createElement('div');
info.style.cssText = 'position:fixed;left:8px;top:8px;color:#fff;font:14px monospace;text-shadow:0 0 3px #000;white-space:pre';
ui.appendChild(info);

function newGame(): void {
  game.start();
  for (const id of [...renderedIds]) { renderer.removePlane(id); renderedIds.delete(id); }
  renderer.addPlane(PLAYER_ID, 'player');
  renderedIds.add(PLAYER_ID);
  renderer.pushPose(PLAYER_ID, game.player.flight.position, game.player.flight.orientation, true);
  input.reset();
  input.setEnabled(true);
}

const renderedIds = new Set<number>();
function handleEvents(events: GameEvent[]): void {
  for (const ev of events) {
    switch (ev.type) {
      case 'spawn': {
        const e = game.enemies.find((x) => x.id === ev.id);
        if (e) {
          renderer.addPlane(e.id, e.kind === 'bomber' ? 'bomber' : 'enemy');
          renderer.pushPose(e.id, e.flight.position, e.flight.orientation, true);
          renderedIds.add(e.id);
        }
        break;
      }
      case 'despawn': renderer.removePlane(ev.id!); renderedIds.delete(ev.id!); break;
      case 'explosion': renderer.spawnExplosion(ev.position!, ev.id === PLAYER_ID || ev.id === undefined); break;
      case 'hit': renderer.spawnHitSpark(ev.position!); break;
      case 'crash': renderer.removePlane(PLAYER_ID); renderedIds.delete(PLAYER_ID); break;
    }
  }
}

function resize(): void {
  renderer.resize(innerWidth, innerHeight, camera);
}
addEventListener('resize', resize);
resize();
newGame();

let lastFrame = performance.now();
const loop = new FixedLoop(
  CONFIG.sim.step,
  CONFIG.sim.maxFrame,
  (dt) => {
    const cmd = input.read(game.player.flight.throttle, dt);
    game.step(cmd, dt);
    handleEvents(game.events);
    renderer.pushPose(PLAYER_ID, game.player.flight.position, game.player.flight.orientation);
    for (const e of game.enemies) renderer.pushPose(e.id, e.flight.position, e.flight.orientation);
  },
  (alpha) => {
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const throttles = new Map<number, number>([[PLAYER_ID, game.player.flight.throttle]]);
    for (const e of game.enemies) throttles.set(e.id, e.flight.throttle);
    renderer.syncPlanes(game.phase === 'paused' ? 1 : alpha, throttles, frameDt);
    renderer.setBullets(game.bullets.bullets);
    renderer.setRunwayDestroyed(game.runwayDestroyed);
    if (game.phase !== 'gameover') renderer.spawnSmoke(PLAYER_ID, 1 - game.player.damage.hp / 100, frameDt);
    for (const e of game.enemies) renderer.spawnSmoke(e.id, 1 - e.damage.hp / 100, frameDt);
    const pose = renderer.planePose(PLAYER_ID);
    const nearest = game.enemies.reduce<THREE.Vector3 | undefined>((best, e) =>
      !best || e.flight.position.distanceTo(game.player.flight.position) < best.distanceTo(game.player.flight.position) ? e.flight.position : best, undefined);
    if (pose) chaseCamera(camera, pose, frameDt, cameraMode === 'target' && nearest ? 'target' : 'chase', nearest);
    renderer.render(camera, frameDt);
    const p = game.player;
    info.textContent = `${game.phase} vague ${game.wave} ${game.phase === 'break' ? Math.ceil(game.breakTimeLeft) + 's' : ''}  ennemis ${game.enemies.length}\n` +
      `vit ${p.flight.speed.toFixed(0)}  alt ${p.flight.position.y.toFixed(0)}  gaz ${(p.flight.throttle * 100).toFixed(0)}%  carb ${p.resources.fuel.toFixed(0)}s  mun ${Math.floor(p.resources.ammo)}  pv ${p.damage.hp.toFixed(0)}\n` +
      `score ${game.score.points}  ${game.lastDeathReason ?? ''}`;
    if (game.phase === 'gameover' && !(window as any).__restartArmed) {
      (window as any).__restartArmed = true;
      setTimeout(() => { (window as any).__restartArmed = false; newGame(); }, 3000);
    }
  },
);
loop.start();
(window as any).__dbg = { game, renderer, input };
