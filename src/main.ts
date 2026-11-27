import * as THREE from 'three';
import './ui/style.css';
import { CONFIG } from './config';
import { FixedLoop } from './core/loop';
import { makeRng } from './core/rng';
import { generateWorld } from './world/cityGen';
import { InputManager } from './input/inputManager';
import { GameRenderer } from './render/renderer';
import { chaseCamera } from './render/camera';
import { Game, PLAYER_ID, type GameEvent, type Phase } from './game/game';
import { Hud } from './ui/hud';
import { Menus, type Settings } from './ui/menus';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const layout = generateWorld(CONFIG.world.seed);
const game = new Game(layout, makeRng(Date.now() & 0xffff));
const renderer = new GameRenderer(canvas, layout);
const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 4000);
const hud = new Hud(ui);
const input = new InputManager(canvas, ui);
const menus = new Menus(ui, {
  onStart: () => { requestImmersive(); newGame(); },
  onResume: () => { requestImmersive(); game.resume(); input.reset(); },
  onQuit: () => { game.phase = 'menu'; clearPlanes(); },
  onSettings: applySettings,
});
const renderedIds = new Set<number>();
let cameraMode: 'chase' | 'target' = 'chase';
let shownPhase: Phase | null = null;

input.onCameraToggle = () => { cameraMode = cameraMode === 'chase' ? 'target' : 'chase'; };
input.onPauseRequest = () => game.pause();

function applySettings(s: Settings): void {
  input.settings = { invertY: s.invertY, sensitivity: CONFIG.input.mouseSensitivity * s.sensitivity };
}
applySettings(menus.current);

function requestImmersive(): void {
  if (input.lastDevice === 'touch') {
    document.documentElement.requestFullscreen?.().then(() => (screen.orientation as any)?.lock?.('landscape')).catch(() => {});
  } else {
    canvas.requestPointerLock?.();
  }
}

function clearPlanes(): void {
  for (const id of [...renderedIds]) { renderer.removePlane(id); renderedIds.delete(id); }
}

function newGame(): void {
  game.start();
  clearPlanes();
  renderer.addPlane(PLAYER_ID, 'player');
  renderedIds.add(PLAYER_ID);
  renderer.pushPose(PLAYER_ID, game.player.flight.position, game.player.flight.orientation, true);
  input.reset();
  cameraMode = 'chase';
}

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
      case 'waveStart': hud.flash(`Vague ${game.wave}`); break;
      case 'waveCleared': hud.flash('Vague terminée !'); break;
      case 'runwayDestroyed': hud.flash('Piste bombardée !'); break;
      case 'kill': hud.flash('Abattu !', 1.2); break;
      case 'landed': hud.flash('Posé ! Arrête-toi pour réparer', 2); break;
    }
  }
}

function resize(): void {
  renderer.resize(innerWidth, innerHeight, camera);
}
addEventListener('resize', resize);
resize();

let lastFrame = performance.now();
let menuAngle = 0;
const loop = new FixedLoop(
  CONFIG.sim.step,
  CONFIG.sim.maxFrame,
  (dt) => {
    const playing = game.phase === 'preflight' || game.phase === 'wave' || game.phase === 'break';
    if (input.enabled !== playing) input.setEnabled(playing);
    const cmd = input.read(game.player.flight.throttle, dt);
    game.step(cmd, dt);
    handleEvents(game.events);
    if (renderedIds.has(PLAYER_ID)) renderer.pushPose(PLAYER_ID, game.player.flight.position, game.player.flight.orientation);
    for (const e of game.enemies) renderer.pushPose(e.id, e.flight.position, e.flight.orientation);
  },
  (alpha) => {
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    if (game.phase !== shownPhase) {
      shownPhase = game.phase;
      menus.show(game.phase, {
        wave: game.wave, score: game.score, best: game.best, newRecord: game.newRecord, reason: game.lastDeathReason, device: input.lastDevice,
      });
      hud.setVisible(game.phase !== 'menu' && game.phase !== 'gameover');
      if (game.phase === 'gameover' && document.pointerLockElement) document.exitPointerLock();
    }

    const throttles = new Map<number, number>([[PLAYER_ID, game.player.flight.throttle]]);
    for (const e of game.enemies) throttles.set(e.id, e.flight.throttle);
    renderer.syncPlanes(game.phase === 'paused' ? 1 : alpha, throttles, game.phase === 'paused' ? 0 : frameDt);
    renderer.setBullets(game.bullets.bullets);
    renderer.setRunwayDestroyed(game.runwayDestroyed && game.phase !== 'menu');
    if (game.phase !== 'paused') {
      if (renderedIds.has(PLAYER_ID)) renderer.spawnSmoke(PLAYER_ID, 1 - game.player.damage.hp / 100, frameDt);
      for (const e of game.enemies) renderer.spawnSmoke(e.id, 1 - e.damage.hp / 100, frameDt);
    }

    if (game.phase === 'menu') {
      // Slow orbit over the city as a menu background.
      menuAngle += frameDt * 0.05;
      camera.position.set(Math.cos(menuAngle) * 1100, 380, Math.sin(menuAngle) * 1100);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 60, 0);
    } else if (game.phase === 'gameover') {
      // Pull back and look at the wreck instead of sitting inside the explosion.
      const wreck = game.player.flight.position;
      const away = camera.position.clone().sub(wreck).setY(0).normalize().multiplyScalar(90).add(wreck).setY(wreck.y + 50);
      camera.position.lerp(away, 1 - Math.exp(-1.5 * frameDt));
      camera.up.set(0, 1, 0);
      camera.lookAt(wreck);
    } else {
      const pose = renderer.planePose(PLAYER_ID) ?? { position: game.player.flight.position, orientation: game.player.flight.orientation };
      let nearest: THREE.Vector3 | undefined;
      let best = Infinity;
      for (const e of game.enemies) {
        const d = e.flight.position.distanceTo(game.player.flight.position);
        if (d < best) { best = d; nearest = e.flight.position; }
      }
      chaseCamera(camera, pose, frameDt, cameraMode === 'target' && nearest ? 'target' : 'chase', nearest);
    }
    renderer.render(camera, game.phase === 'paused' ? 0 : frameDt);
    if (game.phase !== 'menu') hud.update(game, camera, menus.current.easyMode, frameDt);
  },
);
loop.start();
if (import.meta.env.DEV) (window as any).__dbg = { game, renderer, input, newGame };
