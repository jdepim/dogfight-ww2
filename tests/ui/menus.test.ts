// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { Menus } from '../../src/ui/menus';
import { createScore } from '../../src/game/score';

describe('Menus', () => {
  it('shows the death reason, wave, kills and accuracy on game over', () => {
    const root = document.createElement('div');
    const m = new Menus(root, { onStart: () => {}, onResume: () => {}, onQuit: () => {}, onSettings: () => {} });
    const score = { ...createScore(), kills: 3, shots: 40, hits: 10, points: 1200 };
    m.show('gameover', { wave: 4, score, best: 1500, newRecord: false, reason: 'Panne sèche', device: 'desktop' });
    const text = root.textContent!;
    expect(text).toContain('Panne sèche');
    expect(text).toContain('Vague 4');
    expect(text).toContain('3');
    expect(text).toContain('25 %');
    expect(text).toContain('1200');
  });

  it('hides every panel while playing', () => {
    const root = document.createElement('div');
    const m = new Menus(root, { onStart: () => {}, onResume: () => {}, onQuit: () => {}, onSettings: () => {} });
    m.show('wave', { wave: 1, score: createScore(), best: 0, newRecord: false, device: 'desktop' });
    const visible = Array.from(root.querySelectorAll<HTMLElement>('.panel')).filter((p) => p.style.display !== 'none');
    expect(visible.length).toBe(0);
  });

  it('calls onStart when Jouer is clicked', () => {
    const root = document.createElement('div');
    let started = false;
    const m = new Menus(root, { onStart: () => { started = true; }, onResume: () => {}, onQuit: () => {}, onSettings: () => {} });
    m.show('menu', { wave: 0, score: createScore(), best: 0, newRecord: false, device: 'desktop' });
    root.querySelector<HTMLButtonElement>('[data-action="start"]')!.click();
    expect(started).toBe(true);
  });
});
