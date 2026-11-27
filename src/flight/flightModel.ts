import * as THREE from 'three';
import { CONFIG } from '../config';
import type { FlightInput } from '../input/types';

export interface FlightState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  orientation: THREE.Quaternion;
  /** 0..1 */
  throttle: number;
  speed: number;
  onGround: boolean;
  stalled: boolean;
}

/** Damage-derived modifiers (neutral: 1, 1, 0). */
export interface ControlModifiers {
  thrustFactor: number;
  controlFactor: number;
  /** Extra roll command added to input; < 0 rolls left. */
  rollBias: number;
}

export const NEUTRAL_MODS: Readonly<ControlModifiers> = { thrustFactor: 1, controlFactor: 1, rollBias: 0 };

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();

/** heading 0 = facing −Z (north). Positive heading turns right (towards +X). */
export function createFlightState(position: THREE.Vector3, headingRad: number, onGround: boolean): FlightState {
  return {
    position: position.clone(),
    velocity: new THREE.Vector3(),
    orientation: new THREE.Quaternion().setFromAxisAngle(Y, -headingRad),
    throttle: 0,
    speed: 0,
    onGround,
    stalled: false,
  };
}

export function forwardOf(s: FlightState, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(0, 0, -1).applyQuaternion(s.orientation);
}
export function upOf(s: FlightState, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(0, 1, 0).applyQuaternion(s.orientation);
}
export function rightOf(s: FlightState, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(1, 0, 0).applyQuaternion(s.orientation);
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function rotateLocal(s: FlightState, axis: THREE.Vector3, angle: number): void {
  if (angle === 0) return;
  s.orientation.multiply(_q.setFromAxisAngle(axis, angle));
}

/** Integrate one fixed step of arcade flight. Mutates `s`. */
export function stepFlight(s: FlightState, input: FlightInput, mods: ControlModifiers, hasFuel: boolean, dt: number): void {
  const F = CONFIG.flight;
  s.throttle = clamp(s.throttle + input.throttleDelta * F.throttleRate * dt, 0, 1);
  const thrust = hasFuel ? s.throttle * F.maxThrust * mods.thrustFactor : 0;
  const speed = s.velocity.length();

  if (s.onGround) {
    stepGround(s, input, thrust, speed, dt);
    return;
  }

  // --- Rotation: rates shrink at high speed and lose authority near stall.
  const hi = clamp((speed - F.cruiseSpeed) / (F.maxSpeed - F.cruiseSpeed), 0, 1);
  const rateFactor = (1 + (F.highSpeedRateFactor - 1) * hi) * clamp(speed / F.stallSpeed, 0.3, 1) * mods.controlFactor;
  const roll = clamp(input.roll + mods.rollBias, -1, 1);
  rotateLocal(s, X, clamp(input.pitch, -1, 1) * F.pitchRate * rateFactor * dt);
  rotateLocal(s, Z, -roll * F.rollRate * rateFactor * dt);
  rotateLocal(s, Y, -clamp(input.yaw, -1, 1) * F.yawRate * rateFactor * dt);

  s.stalled = speed < F.stallSpeed;
  forwardOf(s, _f);
  upOf(s, _u);

  // Stall: the nose weathervanes into the (falling) flight path.
  if (s.stalled && speed > 0.1) {
    _v.copy(s.velocity).normalize();
    const angle = _f.angleTo(_v);
    if (angle > 1e-4) {
      const axis = new THREE.Vector3().crossVectors(_f, _v).normalize();
      const step = Math.min(angle, F.stallTorque * dt);
      s.orientation.premultiply(_q.setFromAxisAngle(axis, step));
      forwardOf(s, _f);
      upOf(s, _u);
    }
  }

  // --- Forces (unit mass).
  const liftRatio = Math.min(1, (speed / F.stallSpeed) ** 2);
  const acc = new THREE.Vector3()
    .addScaledVector(_f, thrust)
    .addScaledVector(_u, F.gravity * liftRatio)
    .addScaledVector(Y, -F.gravity);
  if (speed > 0) acc.addScaledVector(s.velocity, -F.dragCoef * speed);
  s.velocity.addScaledVector(acc, dt);

  // --- Arcade grip: the flight path follows the nose (weaker when stalled).
  const sp = s.velocity.length();
  if (sp > 0.1) {
    const grip = 1 - Math.exp(-F.alignRate * liftRatio * dt);
    _v.copy(s.velocity).divideScalar(sp).lerp(_f, grip).normalize();
    s.velocity.copy(_v).multiplyScalar(Math.min(sp, F.maxSpeed * F.maxDiveFactor));
  }
  s.speed = s.velocity.length();
  s.position.addScaledVector(s.velocity, dt);
}

function stepGround(s: FlightState, input: FlightInput, thrust: number, speed: number, dt: number): void {
  const F = CONFIG.flight;
  s.stalled = false;
  // Keep only heading: wings level, nose level.
  forwardOf(s, _f);
  let heading = Math.atan2(_f.x, -_f.z);
  const steer = clamp(input.yaw + input.roll, -1, 1);
  heading += steer * F.groundTurnRate * Math.min(1, speed / 10) * dt;
  s.orientation.setFromAxisAngle(Y, -heading);
  forwardOf(s, _f);

  let v = speed + (thrust - F.dragCoef * speed * speed - F.rollingFriction) * dt;
  if (s.throttle < 0.05) v -= F.idleBrake * dt;
  v = Math.max(0, v);
  s.velocity.copy(_f).multiplyScalar(v);
  s.speed = v;
  s.position.addScaledVector(s.velocity, dt);
  s.position.y = F.groundClearance;

  if (v > F.stallSpeed && input.pitch > 0.2) {
    s.onGround = false;
    rotateLocal(s, X, 0.08);
    s.velocity.y += 2;
  }
}
