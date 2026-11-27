import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { chaseCamera } from '../../src/render/camera';
import { createFlightState } from '../../src/flight/flightModel';

describe('chaseCamera', () => {
  it('settles behind and above the plane, looking at it', () => {
    const s = createFlightState(new THREE.Vector3(0, 300, 0), 0, false);
    const cam = new THREE.PerspectiveCamera(70, 1, 0.5, 3000);
    for (let i = 0; i < 120; i++) chaseCamera(cam, s, 1 / 60, 'chase');
    expect(cam.position.z).toBeGreaterThan(5);
    expect(cam.position.y).toBeGreaterThan(300);
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const toPlane = s.position.clone().sub(cam.position).normalize();
    expect(dir.dot(toPlane)).toBeGreaterThan(0.95);
  });

  it('target mode keeps both player and target in front of the camera', () => {
    const s = createFlightState(new THREE.Vector3(0, 300, 0), 0, false);
    const target = new THREE.Vector3(200, 350, 0);
    const cam = new THREE.PerspectiveCamera(70, 1, 0.5, 3000);
    for (let i = 0; i < 120; i++) chaseCamera(cam, s, 1 / 60, 'target', target);
    const dir = cam.getWorldDirection(new THREE.Vector3());
    expect(dir.dot(target.clone().sub(cam.position).normalize())).toBeGreaterThan(0.9);
    expect(dir.dot(s.position.clone().sub(cam.position).normalize())).toBeGreaterThan(0.5);
  });
});
