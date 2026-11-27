/** Pilot commands, all axes in [-1, 1]. pitch + = nose up, roll + = roll right, yaw + = nose right. */
export interface FlightInput {
  pitch: number;
  roll: number;
  yaw: number;
  /** Throttle change request in [-1, 1] (per second, scaled by CONFIG.flight.throttleRate). */
  throttleDelta: number;
  fire: boolean;
}

export const NEUTRAL_INPUT: Readonly<FlightInput> = { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, fire: false };
