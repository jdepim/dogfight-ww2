import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { chaseCamera, fovForAspect } from '../../src/render/camera';
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

describe('camera comfort', () => {
  it('keeps the horizontal field of view at or below 80° on wide phone screens', () => {
    for (const aspect of [1.33, 16 / 9, 844 / 390, 2.4]) {
      const v = fovForAspect(aspect);
      const h = 2 * Math.atan(Math.tan((v * Math.PI) / 360) * aspect) * 180 / Math.PI;
      expect(h).toBeLessThanOrEqual(80.5);
      expect(v).toBeLessThanOrEqual(70);
    }
  });

  it('keeps the horizon level when the plane banks (the plane rolls, not the world)', () => {
    const s = createFlightState(new THREE.Vector3(0, 300, 0), 0, false);
    s.orientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.0));
    const cam = new THREE.PerspectiveCamera(70, 1, 0.5, 3000);
    for (let i = 0; i < 120; i++) chaseCamera(cam, s, 1 / 60, 'chase');
    expect(cam.up.dot(new THREE.Vector3(0, 1, 0))).toBeGreaterThan(0.97);
    expect(cam.position.y).toBeGreaterThan(300); // stays above, not swung to the side
  });

  it('stays well-defined in a vertical climb', () => {
    const s = createFlightState(new THREE.Vector3(0, 300, 0), 0, false);
    s.orientation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const cam = new THREE.PerspectiveCamera(70, 1, 0.5, 3000);
    for (let i = 0; i < 120; i++) chaseCamera(cam, s, 1 / 60, 'chase');
    const dir = cam.getWorldDirection(new THREE.Vector3());
    expect(Number.isFinite(cam.quaternion.x)).toBe(true);
    expect(Math.abs(dir.dot(cam.up))).toBeLessThan(0.9);
  });
});

describe('camera distance', () => {
  it('backs off when the field of view is narrower, so the plane keeps the same size on screen', () => {
    const s = createFlightState(new THREE.Vector3(0, 300, 0), 0, false);
    const wide = new THREE.PerspectiveCamera(70, 1, 0.5, 3000);
    const narrow = new THREE.PerspectiveCamera(42, 1, 0.5, 3000);
    for (let i = 0; i < 120; i++) { chaseCamera(wide, s, 1 / 60, 'chase'); chaseCamera(narrow, s, 1 / 60, 'chase'); }
    const dw = wide.position.distanceTo(s.position), dn = narrow.position.distanceTo(s.position);
    expect(dn / dw).toBeCloseTo(Math.tan((35 * Math.PI) / 180) / Math.tan((21 * Math.PI) / 180), 1);
  });
});
