/** Single source of every tunable value (spec §8). Units: m, s, rad. */
export const CONFIG = {
  sim: { step: 1 / 60, maxFrame: 0.25 },
  flight: {
    stallSpeed: 45, cruiseSpeed: 110, maxSpeed: 160, maxThrust: 18, dragCoef: 0.0007,
    pitchRate: 1.4, rollRate: 2.6, yawRate: 0.5, highSpeedRateFactor: 0.6, gravity: 9.81,
  },
  resources: { fuelSeconds: 240, ammo: 300, fireRate: 15, refuelSeconds: 5 },
  bullets: { speed: 600, range: 800, gravityFactor: 0.3, tracerEvery: 4 },
  aim: { leadIndicatorRange: 350 },
  waves: { pauseSeconds: 30, maxFighters: 8, bomberEvery: 5 },
  world: { size: 4000, ceiling: 1500, seed: 1944 },
} as const;
