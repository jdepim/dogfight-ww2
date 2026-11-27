const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/** Mouse delta → stick increment. Mouse towards you (dy > 0) = nose up unless invertY. */
export function mapMouse(dx: number, dy: number, sensitivity: number, invertY: boolean): { pitch: number; roll: number } {
  return { roll: clamp1(dx * sensitivity), pitch: clamp1(dy * sensitivity * (invertY ? -1 : 1)) };
}

/** Virtual joystick offset (screen px, y down) → stick. Stick down = nose up. */
export function mapJoystick(offsetX: number, offsetY: number, radius: number, deadZone: number): { pitch: number; roll: number } {
  const nx = offsetX / radius, ny = offsetY / radius;
  const m = Math.hypot(nx, ny);
  if (m < deadZone) return { pitch: 0, roll: 0 };
  const k = Math.min(1, (m - deadZone) / (1 - deadZone)) / m;
  return { roll: clamp1(nx * k) + 0, pitch: clamp1(ny * k) + 0 };
}

/** Converts an absolute throttle target (touch slider) into a throttleDelta command. */
export function throttleDeltaTowards(target: number, current: number): number {
  const d = target - current;
  return Math.abs(d) < 0.01 ? 0 : clamp1(d * 5);
}
