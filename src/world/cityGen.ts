import * as THREE from 'three';
import { CONFIG } from '../config';
import { makeRng } from '../core/rng';

export interface Building {
  min: THREE.Vector3;
  max: THREE.Vector3;
  style: 'tower' | 'house';
  seed: number;
}

export interface Runway {
  center: THREE.Vector3;
  /** 0 = runway axis along −Z/+Z (north-south) */
  headingRad: number;
  length: number;
  width: number;
  refuelZone: { min: THREE.Vector3; max: THREE.Vector3 };
  /** Runway unusable while currentWave <= destroyedUntilWave. 0 = intact. */
  destroyedUntilWave: number;
}

export interface WorldLayout {
  buildings: Building[];
  runway: Runway;
  /** Distance from map centre where enemies spawn. */
  spawnRing: number;
}

const CITY_HALF = 700;
const CELL = 100;
const STREET = 40;

/** Deterministic map: a tower grid in the centre, villages around, airfield on the west edge. */
export function generateWorld(seed: number): WorldLayout {
  const rng = makeRng(seed);
  const half = CONFIG.world.size / 2;
  const runway: Runway = {
    center: new THREE.Vector3(-1500, 0, 0),
    headingRad: 0,
    length: 700,
    width: 40,
    refuelZone: { min: new THREE.Vector3(-1520, 0, -350), max: new THREE.Vector3(-1480, 0, 350) },
    destroyedUntilWave: 0,
  };
  const buildings: Building[] = [];
  const nearRunway = (x: number, z: number, margin: number) =>
    Math.abs(x - runway.center.x) < 150 + margin && Math.abs(z - runway.center.z) < runway.length / 2 + 300 + margin;

  // City towers: one per cell, footprint CELL - STREET, taller towards the centre.
  for (let cx = -CITY_HALF; cx < CITY_HALF; cx += CELL)
    for (let cz = -CITY_HALF; cz < CITY_HALF; cz += CELL) {
      if (rng() < 0.15) continue; // park / square
      const foot = CELL - STREET - Math.floor(rng() * 3) * 8; // multiple of 4 m (tower voxel size)
      const x0 = cx + (CELL - foot) / 2, z0 = cz + (CELL - foot) / 2;
      const dist = Math.hypot(cx + CELL / 2, cz + CELL / 2) / (CITY_HALF * Math.SQRT2);
      const h = Math.round((40 + (1 - dist) * 140 * (0.5 + rng() * 0.5)) / 4) * 4;
      buildings.push({
        min: new THREE.Vector3(x0, 0, z0),
        max: new THREE.Vector3(x0 + foot, Math.min(200, Math.max(40, h)), z0 + foot),
        style: 'tower',
        seed: Math.floor(rng() * 1e9),
      });
    }

  // Villages
  const villages = 5 + Math.floor(rng() * 2);
  for (let v = 0; v < villages; v++) {
    const ang = (v / villages) * Math.PI * 2 + rng() * 0.5;
    const r = 1150 + rng() * 500;
    const vx = Math.cos(ang) * r, vz = Math.sin(ang) * r;
    if (nearRunway(vx, vz, 150)) continue;
    const n = 6 + Math.floor(rng() * 7);
    for (let i = 0; i < n; i++) {
      const w = 10 + Math.floor(rng() * 4) * 2, d = 10 + Math.floor(rng() * 4) * 2;
      const x = vx + (rng() - 0.5) * 160, z = vz + (rng() - 0.5) * 160;
      if (Math.abs(x) + w > half || Math.abs(z) + d > half || nearRunway(x, z, 20)) continue;
      const wall = 6 + Math.floor(rng() * 3) * 2;
      const overlaps = buildings.some((b) => x < b.max.x + 4 && x + w > b.min.x - 4 && z < b.max.z + 4 && z + d > b.min.z - 4);
      if (overlaps) continue;
      // Collision box: walls + half the roof height (pitched roof).
      buildings.push({
        min: new THREE.Vector3(x, 0, z),
        max: new THREE.Vector3(x + w, wall + Math.ceil(Math.min(w, d) / 4), z + d),
        style: 'house',
        seed: Math.floor(rng() * 1e9),
      });
    }
  }
  return { buildings, runway, spawnRing: half * 0.85 };
}
