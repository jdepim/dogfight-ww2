/** Single source of every tunable value (spec §8). Units: m, s, rad. */
export const CONFIG = {
  sim: { step: 1 / 60, maxFrame: 0.25 },
  flight: {
    stallSpeed: 45, cruiseSpeed: 110, maxSpeed: 160, enginePower: 331, minThrustSpeed: 40, dragCoef: 0.0000808, idlePropDrag: 2,
    pitchRate: 1.4, rollRate: 2.6, yawRate: 0.5, highSpeedRateFactor: 0.6, gravity: 9.81,
    throttleRate: 0.6, groundClearance: 1.5, alignRate: 3, stallTorque: 1.5,
    rollingFriction: 0.4, idleBrake: 3, maxDiveFactor: 1.25, groundTurnRate: 0.6,
  },
  damage: { hpPerUnit: 40, engineThrustLoss: 0.6, tailControlLoss: 0.5, wingRollBias: 0.6, tankLeak: 0.5 },
  resources: { fuelSeconds: 240, ammo: 300, fireRate: 15, refuelSeconds: 5 },
  bullets: { speed: 600, range: 800, gravityFactor: 0.3, tracerEvery: 4 },
  landing: { maxSpeed: 60, maxSink: 4, maxRollDeg: 10, maxHeadingDeg: 15 },
  input: { mouseSensitivity: 0.004, mouseRecenter: 2.5, deadZone: 0.12, invertY: false },
  aim: { leadIndicatorRange: 350 },
  waves: { pauseSeconds: 30, maxFighters: 8, bomberEvery: 5 },
  world: { size: 4000, ceiling: 1500, seed: 1944 },
} as const;
