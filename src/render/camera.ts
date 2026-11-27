import * as THREE from 'three';
import type { FlightState } from '../flight/flightModel';

type Pose = Pick<FlightState, 'position' | 'orientation'>;

const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _want = new THREE.Vector3();
const _look = new THREE.Vector3();
const _up = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const BACK = 16, UP = 4.5, AHEAD = 30, STIFFNESS = 7;
const MAX_HFOV = 80, MAX_VFOV = 70;

/** Vertical FOV (degrees) that keeps the horizontal FOV ≤ 80°: wide phone screens otherwise stretch like a fish-eye. */
export function fovForAspect(aspect: number): number {
  const v = (2 * Math.atan(Math.tan((MAX_HFOV * Math.PI) / 360) / aspect) * 180) / Math.PI;
  return Math.min(MAX_VFOV, v);
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Damped third-person camera. 'target' mode frames the player and a target point. */
export function chaseCamera(cam: THREE.PerspectiveCamera, target: Pose, dt: number, mode: 'chase' | 'target', lookAt?: THREE.Vector3): void {
  // Smooth the orientation, not the position: no lag behind a fast plane, but soft rotations.
  const k = 1 - Math.exp(-STIFFNESS * dt);
  const q: THREE.Quaternion = cam.userData.q ?? (cam.userData.q = target.orientation.clone());
  q.slerp(target.orientation, k);
  _f.set(0, 0, -1).applyQuaternion(q);
  _u.set(0, 1, 0).applyQuaternion(q);
  if (mode === 'target' && lookAt) {
    const toT = _look.subVectors(lookAt, target.position).normalize();
    _want.copy(target.position).addScaledVector(toT, -BACK * 1.4).addScaledVector(WORLD_UP, UP * 1.5);
    _look.copy(lookAt);
    _up.copy(WORLD_UP);
  } else {
    // Horizon stays level: the plane visibly rolls on its axis instead of the world tilting.
    // Only near the vertical (loops) does the camera borrow the plane's up to stay well-defined.
    const w = smoothstep(0.75, 0.97, Math.abs(_f.y));
    _up.copy(WORLD_UP).multiplyScalar(1 - w).addScaledVector(_u, w).normalize();
    _want.copy(target.position).addScaledVector(_f, -BACK).addScaledVector(_up, UP);
    _look.copy(target.position).addScaledVector(_f, AHEAD);
  }
  if (mode === 'target') cam.position.lerp(_want, k);
  else cam.position.copy(_want);
  // Never let the camera fall below the ground.
  cam.position.y = Math.max(cam.position.y, 2);
  cam.up.lerp(_up, k).normalize();
  cam.lookAt(_look);
}
