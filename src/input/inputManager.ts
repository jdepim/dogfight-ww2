import { CONFIG } from '../config';
import type { FlightInput } from './types';
import { mapJoystick, mapMouse, throttleDeltaTowards } from './mapping';

export interface InputSettings {
  invertY: boolean;
  sensitivity: number;
}

/**
 * Merges desktop (pointer-locked mouse + keyboard) and touch (virtual joystick, throttle slider,
 * fire button) into one FlightInput. The last device used wins.
 */
export class InputManager {
  lastDevice: 'desktop' | 'touch' = 'desktop';
  onPauseRequest: () => void = () => {};
  onCameraToggle: () => void = () => {};
  settings: InputSettings = { invertY: CONFIG.input.invertY, sensitivity: CONFIG.input.mouseSensitivity };
  /** When false, mouse/keys are ignored (menus open). */
  enabled = false;

  private keys = new Set<string>();
  private stick = { pitch: 0, roll: 0 };
  private mouseFire = false;
  private touchStick = { pitch: 0, roll: 0 };
  private touchFire = false;
  private touchThrottle: number | null = null;
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private touchUi: HTMLElement;
  private joyKnob: HTMLElement;
  private joyBase: HTMLElement;
  private thrFill: HTMLElement;
  private disposers: (() => void)[] = [];
  /** Browsers emulate mouse events after a tap: ignore mouse input this long after a touch. */
  private lastTouch = -Infinity;
  private recentTouch(): boolean { return performance.now() - this.lastTouch < 800; }

  constructor(private canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.touchUi = el('div', 'touch-ui', overlay);
    this.joyBase = el('div', 'joy-base', this.touchUi);
    this.joyKnob = el('div', 'joy-knob', this.joyBase);
    const thr = el('div', 'thr-track', this.touchUi);
    this.thrFill = el('div', 'thr-fill', thr);
    el('div', 'thr-label', thr).textContent = 'GAZ';
    const fire = el('div', 'fire-btn', this.touchUi);
    fire.textContent = 'FEU';
    this.setTouchUiVisible(false);

    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K | string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn, opts);
      this.disposers.push(() => t.removeEventListener(type, fn, opts));
    };

    // --- Desktop
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.code === 'Escape') { this.onPauseRequest(); return; }
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (e.code === 'KeyC' && !e.repeat) this.onCameraToggle();
      if (e.code === 'Space') e.preventDefault();
      this.useDesktop();
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    on(canvas, 'mousedown', (e: MouseEvent) => {
      if (!this.enabled || this.recentTouch()) return;
      this.useDesktop();
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
      if (e.button === 0) this.mouseFire = true;
    });
    on(window, 'mouseup', (e: MouseEvent) => { if (e.button === 0) this.mouseFire = false; });
    on(window, 'mousemove', (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas || !this.enabled || this.recentTouch()) return;
      this.useDesktop();
      const d = mapMouse(e.movementX, e.movementY, this.settings.sensitivity, this.settings.invertY);
      this.stick.roll = clamp(this.stick.roll + d.roll, -1, 1);
      this.stick.pitch = clamp(this.stick.pitch + d.pitch, -1, 1);
    });
    on(document, 'pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && this.enabled && this.lastDevice === 'desktop') this.onPauseRequest();
    });
    on(window, 'blur', () => { this.releaseAll(); if (this.enabled) this.onPauseRequest(); });
    on(document, 'visibilitychange', () => { if (document.hidden) { this.releaseAll(); if (this.enabled) this.onPauseRequest(); } });

    // --- Touch
    on(window, 'touchstart', () => { this.lastTouch = performance.now(); this.useTouch(); }, { passive: true });
    // Rotating a phone to portrait hides the controls behind the "turn your phone" overlay: pause.
    const portrait = window.matchMedia?.('(orientation: portrait) and (pointer: coarse)');
    if (portrait) on(portrait as unknown as EventTarget, 'change', (e: { matches: boolean }) => { if (e.matches && this.enabled) this.onPauseRequest(); });
    on(this.joyBase, 'touchstart', (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joyId = t.identifier;
      const r = this.joyBase.getBoundingClientRect();
      this.joyOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.moveJoy(t.clientX, t.clientY);
    }, { passive: false });
    on(window, 'touchmove', (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.joyId) this.moveJoy(t.clientX, t.clientY);
    }, { passive: true });
    const endJoy = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.joyId) {
        this.joyId = null; this.touchStick = { pitch: 0, roll: 0 }; this.joyKnob.style.transform = '';
      }
    };
    on(window, 'touchend', endJoy);
    on(window, 'touchcancel', endJoy);
    const setThr = (e: TouchEvent) => {
      e.preventDefault();
      const r = thr.getBoundingClientRect();
      const t = e.targetTouches[0];
      if (!t) return;
      this.touchThrottle = clamp(1 - (t.clientY - r.top) / r.height, 0, 1);
    };
    on(thr, 'touchstart', setThr, { passive: false });
    on(thr, 'touchmove', setThr, { passive: false });
    on(fire, 'touchstart', (e: TouchEvent) => { e.preventDefault(); this.touchFire = true; fire.classList.add('down'); }, { passive: false });
    const fireUp = () => { this.touchFire = false; fire.classList.remove('down'); };
    on(fire, 'touchend', fireUp);
    on(fire, 'touchcancel', fireUp);
  }

  private moveJoy(x: number, y: number): void {
    const radius = this.joyBase.clientWidth / 2 || 60;
    const dx = x - this.joyOrigin.x, dy = y - this.joyOrigin.y;
    this.touchStick = mapJoystick(dx, dy, radius, CONFIG.input.deadZone);
    const m = Math.hypot(dx, dy), k = m > radius ? radius / m : 1;
    this.joyKnob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  }

  private useDesktop(): void {
    if (this.lastDevice !== 'desktop') { this.lastDevice = 'desktop'; this.setTouchUiVisible(false); }
  }
  private useTouch(): void {
    if (this.lastDevice !== 'touch') { this.lastDevice = 'touch'; this.setTouchUiVisible(this.enabled); }
  }

  private releaseAll(): void {
    this.keys.clear();
    this.mouseFire = false;
    this.touchFire = false;
  }

  /** Reset sticks (e.g. after respawn or resume). */
  reset(): void {
    this.releaseAll();
    this.stick = { pitch: 0, roll: 0 };
    this.touchStick = { pitch: 0, roll: 0 };
    this.touchThrottle = null;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) { this.releaseAll(); if (document.pointerLockElement === this.canvas) document.exitPointerLock?.(); }
    this.setTouchUiVisible(v && this.lastDevice === 'touch');
  }

  setTouchUiVisible(v: boolean): void {
    this.touchUi.style.display = v ? '' : 'none';
  }

  /** Read the merged command. `currentThrottle` is needed to convert the touch slider. `dt` drives mouse recentring. */
  read(currentThrottle: number, dt: number): FlightInput {
    if (!this.enabled) return { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, fire: false };
    if (this.lastDevice === 'touch') {
      const target = this.touchThrottle ?? currentThrottle;
      this.thrFill.style.height = `${Math.round(currentThrottle * 100)}%`;
      return { pitch: this.touchStick.pitch, roll: this.touchStick.roll, yaw: 0, throttleDelta: throttleDeltaTowards(target, currentThrottle), fire: this.touchFire };
    }
    const k = this.keys;
    // Mouse stick recentres slowly so the plane does not keep turning forever.
    const decay = Math.exp(-CONFIG.input.mouseRecenter * dt);
    this.stick.pitch *= decay;
    this.stick.roll *= decay;
    const kbPitch = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
    const kbRoll = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    return {
      pitch: clamp(this.stick.pitch + kbPitch * (this.settings.invertY ? -1 : 1), -1, 1),
      roll: clamp(this.stick.roll + kbRoll, -1, 1),
      yaw: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      throttleDelta: (k.has('KeyW') || k.has('KeyZ') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
      fire: this.mouseFire || k.has('Space'),
    };
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.touchUi.remove();
  }
}

function el(tag: string, cls: string, parent: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
