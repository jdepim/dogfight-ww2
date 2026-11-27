import * as THREE from 'three';
import { CONFIG } from '../config';

const _v = new THREE.Vector3();

export function shouldShowLead(distance: number, easyMode: boolean): boolean {
  return easyMode || distance < CONFIG.aim.leadIndicatorRange;
}

export function projectToScreen(p: THREE.Vector3, cam: THREE.Camera, w: number, h: number): { x: number; y: number; onScreen: boolean } {
  _v.copy(p).applyMatrix4(cam.matrixWorldInverse);
  const inFront = _v.z < 0;
  _v.copy(p).project(cam);
  const x = ((_v.x + 1) / 2) * w, y = ((1 - _v.y) / 2) * h;
  return { x, y, onScreen: inFront && Math.abs(_v.x) <= 1 && Math.abs(_v.y) <= 1 };
}

/** Screen-space angle (radians, 0 = right, −π/2 = up) pointing towards an off-screen point. */
export function edgeArrow(p: THREE.Vector3, cam: THREE.Camera): { angle: number } {
  _v.copy(p).applyMatrix4(cam.matrixWorldInverse);
  let sx = _v.x, sy = -_v.y;
  if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) sy = 1;
  return { angle: Math.atan2(sy, sx) };
}
