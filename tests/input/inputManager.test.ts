// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { InputManager } from '../../src/input/inputManager';

function setup(portraitMql?: { matches: boolean; listeners: ((e: { matches: boolean }) => void)[] }) {
  if (portraitMql) {
    (window as any).matchMedia = vi.fn(() => ({
      matches: portraitMql.matches,
      addEventListener: (_: string, fn: any) => portraitMql.listeners.push(fn),
      removeEventListener: () => {},
    }));
  }
  const canvas = document.createElement('canvas');
  const overlay = document.createElement('div');
  document.body.append(canvas, overlay);
  const im = new InputManager(canvas, overlay);
  im.setEnabled(true);
  return { im, canvas };
}

describe('InputManager', () => {
  it('a tap on the 3D view (emulated mouse after touch) keeps touch controls', () => {
    const { im, canvas } = setup();
    window.dispatchEvent(new Event('touchstart'));
    expect(im.lastDevice).toBe('touch');
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    expect(im.lastDevice).toBe('touch');
    im.dispose();
  });

  it('pauses when a phone is rotated to portrait mid-flight', () => {
    const mql = { matches: false, listeners: [] as ((e: { matches: boolean }) => void)[] };
    const { im } = setup(mql);
    let paused = 0;
    im.onPauseRequest = () => { paused++; };
    mql.listeners.forEach((fn) => fn({ matches: true }));
    expect(paused).toBe(1);
    im.dispose();
  });
});
