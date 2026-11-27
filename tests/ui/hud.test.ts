import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { shouldShowLead, projectToScreen, edgeArrow } from '../../src/ui/hudMath';

function cam() {
  const c = new THREE.PerspectiveCamera(70, 16 / 9, 0.5, 4000);
  c.position.set(0, 0, 0);
  c.lookAt(0, 0, -1);
  c.updateMatrixWorld();
  return c;
}

describe('shouldShowLead', () => {
  it('shows within 350 m in normal mode', () => expect(shouldShowLead(300, false)).toBe(true));
  it('hides beyond 350 m in normal mode', () => expect(shouldShowLead(400, false)).toBe(false));
  it('always shows in easy mode', () => expect(shouldShowLead(2000, true)).toBe(true));
});

describe('projectToScreen', () => {
  it('maps a point straight ahead to the screen centre', () => {
    const r = projectToScreen(new THREE.Vector3(0, 0, -100), cam(), 1600, 900);
    expect(r.onScreen).toBe(true);
    expect(r.x).toBeCloseTo(800, 3);
    expect(r.y).toBeCloseTo(450, 3);
  });
  it('flags a point behind the camera as off-screen', () => {
    expect(projectToScreen(new THREE.Vector3(0, 0, 100), cam(), 1600, 900).onScreen).toBe(false);
  });
  it('flags a point far to the side as off-screen', () => {
    expect(projectToScreen(new THREE.Vector3(1000, 0, -10), cam(), 1600, 900).onScreen).toBe(false);
  });
});

describe('edgeArrow', () => {
  it('points right for a target on the right, behind or not', () => {
    expect(Math.abs(edgeArrow(new THREE.Vector3(100, 0, -10), cam()).angle)).toBeLessThan(0.2);
    expect(Math.abs(edgeArrow(new THREE.Vector3(100, 0, 50), cam()).angle)).toBeLessThan(0.6);
  });
  it('points up (negative screen angle) for a target above', () => {
    expect(edgeArrow(new THREE.Vector3(0, 100, -10), cam()).angle).toBeCloseTo(-Math.PI / 2, 1);
  });
});
