import * as THREE from 'three';
import { CONFIG } from './config';
import { FixedLoop } from './core/loop';
import { generateWorld } from './world/cityGen';
import { CollisionWorld } from './world/collision';
import { checkTouchdown } from './world/airfield';
import { createFlightState, stepFlight, NEUTRAL_MODS, type FlightState } from './flight/flightModel';
import { InputManager } from './input/inputManager';
import { GameRenderer } from './render/renderer';
import { chaseCamera } from './render/camera';

// Task 8: free flight only (replaced by Game in Task 10).
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const layout = generateWorld(CONFIG.world.seed);
const world = new CollisionWorld(layout.buildings);
const renderer = new GameRenderer(canvas, layout);
const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 4000);
const input = new InputManager(canvas, ui);
input.setEnabled(true);

const PLAYER = 0;
let player: FlightState;
let respawnTimer = 0;
const info = document.createElement('div');
info.style.cssText = 'position:fixed;left:8px;top:8px;color:#fff;font:14px monospace;text-shadow:0 0 3px #000';
ui.appendChild(info);

function spawn(): void {
  const rw = layout.runway;
  player = createFlightState(new THREE.Vector3(rw.center.x, CONFIG.flight.groundClearance, rw.center.z + rw.length / 2 - 30), rw.headingRad, true);
  if (!renderer.hasPlane(PLAYER)) renderer.addPlane(PLAYER, 'player');
  renderer.pushPose(PLAYER, player.position, player.orientation, true);
  camera.position.copy(player.position).add(new THREE.Vector3(0, 6, 20));
}
spawn();

function resize(): void {
  renderer.resize(innerWidth, innerHeight, camera);
}
addEventListener('resize', resize);
resize();

let lastFrame = performance.now();
const loop = new FixedLoop(
  CONFIG.sim.step,
  CONFIG.sim.maxFrame,
  (dt) => {
    if (respawnTimer > 0) {
      respawnTimer -= dt;
      if (respawnTimer <= 0) { spawn(); input.reset(); }
      return;
    }
    const cmd = input.read(player.throttle, dt);
    stepFlight(player, cmd, NEUTRAL_MODS, true, dt);
    if (!player.onGround) {
      const td = checkTouchdown(player, layout.runway, 1);
      if (td.result === 'landed') { player.onGround = true; player.velocity.y = 0; }
      const hitBuilding = world.sphereHits(player.position, 3);
      if (td.result === 'crash' || hitBuilding) {
        renderer.spawnExplosion(player.position, true);
        renderer.removePlane(PLAYER);
        respawnTimer = 2;
        return;
      }
    }
    renderer.pushPose(PLAYER, player.position, player.orientation);
  },
  (alpha) => {
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    renderer.syncPlanes(alpha, new Map([[PLAYER, player.throttle]]), frameDt);
    const pose = renderer.planePose(PLAYER);
    if (pose) chaseCamera(camera, pose, frameDt, 'chase');
    renderer.render(camera, frameDt);
    info.textContent = `vit ${player.speed.toFixed(0)} m/s  alt ${player.position.y.toFixed(0)} m  gaz ${(player.throttle * 100).toFixed(0)}%  ${player.stalled ? 'DÉCROCHAGE' : ''}  draw ${renderer.drawCalls}`;
  },
);
loop.start();
(window as any).__dbg = { get player() { return player; }, renderer, input };
