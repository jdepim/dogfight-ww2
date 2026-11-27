import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Game } from '../game/game';
import { forwardOf } from '../flight/flightModel';
import { gearDown } from '../world/airfield';
import { leadPoint } from '../combat/ballistics';
import { ZONES, type Zone } from '../flight/damage';
import { edgeArrow, projectToScreen, shouldShowLead } from './hudMath';

const MAX_MARKERS = 16;

function div(cls: string, parent: HTMLElement, html = ''): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  parent.appendChild(d);
  return d;
}

/** In-game overlay. Pure DOM, updated every rendered frame. */
export class Hud {
  private el: HTMLElement;
  private wave: HTMLElement;
  private msg: HTMLElement;
  private speed: HTMLElement;
  private alt: HTMLElement;
  private thr: HTMLElement;
  private fuel: HTMLElement;
  private ammo: HTMLElement;
  private score: HTMLElement;
  private zones: Record<Zone, HTMLElement>;
  private cross: HTMLElement;
  private markers: HTMLElement[] = [];
  private leads: HTMLElement[] = [];
  private arrows: HTMLElement[] = [];
  private runwayArrow: HTMLElement;
  private runwayMark: HTMLElement;
  private toast: HTMLElement;
  private toastTimer = 0;
  private _p = new THREE.Vector3();

  constructor(root: HTMLElement) {
    this.el = div('hud', root);
    this.wave = div('hud-wave', this.el);
    this.msg = div('hud-msg', this.el);
    this.toast = div('hud-toast', this.el);
    const panel = div('hud-panel', this.el);
    this.speed = div('hud-row', panel);
    this.alt = div('hud-row', panel);
    this.thr = div('hud-bar thr', panel, '<span>GAZ</span><i></i>');
    this.fuel = div('hud-bar fuel', panel, '<span>CARB</span><i></i>');
    this.ammo = div('hud-row', panel);
    const sil = div('hud-plane', panel);
    this.zones = Object.fromEntries(ZONES.map((z) => [z, div(`z z-${z}`, sil)])) as Record<Zone, HTMLElement>;
    this.score = div('hud-score', this.el);
    this.cross = div('hud-cross', this.el);
    for (let i = 0; i < MAX_MARKERS; i++) {
      this.markers.push(div('hud-marker', this.el));
      this.leads.push(div('hud-lead', this.el));
      this.arrows.push(div('hud-arrow', this.el));
    }
    this.runwayArrow = div('hud-arrow runway', this.el);
    this.runwayMark = div('hud-runway', this.el, 'PISTE');
  }

  setVisible(v: boolean): void {
    this.el.style.display = v ? '' : 'none';
  }

  /** Short message shown for a few seconds (wave start, etc.). */
  flash(text: string, seconds = 3): void {
    this.toast.textContent = text;
    this.toast.style.opacity = '1';
    this.toastTimer = seconds;
  }

  update(game: Game, cam: THREE.Camera, easyMode: boolean, dt: number): void {
    const w = innerWidth, h = innerHeight;
    const p = game.player, f = p.flight;
    const kmh = Math.round(f.speed * 3.6);
    this.speed.innerHTML = `<b>${kmh}</b> km/h`;
    this.alt.innerHTML = `<b>${Math.max(0, Math.round(f.position.y - CONFIG.flight.groundClearance))}</b> m`;
    (this.thr.lastElementChild as HTMLElement).style.width = `${f.throttle * 100}%`;
    const fuelPct = p.resources.fuel / CONFIG.resources.fuelSeconds;
    (this.fuel.lastElementChild as HTMLElement).style.width = `${fuelPct * 100}%`;
    this.fuel.classList.toggle('low', fuelPct < 0.25);
    const ammo = Math.floor(p.resources.ammo);
    this.ammo.innerHTML = `<b>${ammo}</b> balles`;
    this.ammo.classList.toggle('low', ammo < CONFIG.resources.ammo * 0.2);
    for (const z of ZONES) {
      const d = p.damage.zones[z];
      this.zones[z].style.background = d < 0.05 ? '#4caf50' : d < 0.5 ? '#ff9800' : '#f44336';
    }
    this.score.textContent = `${game.score.points} pts`;

    // Wave line
    if (game.phase === 'preflight') this.wave.textContent = 'Décollage : plein gaz, puis tire le manche';
    else if (game.phase === 'break') this.wave.textContent = `Vague ${game.wave} terminée · prochaine dans ${Math.ceil(game.breakTimeLeft)} s`;
    else this.wave.textContent = `Vague ${game.wave} · ${game.enemies.length} ennemi${game.enemies.length > 1 ? 's' : ''}`;

    // Status messages (one at a time, by priority)
    const bounds = game.boundsState;
    let msg = '';
    if (f.stalled) msg = 'DÉCROCHAGE ! Pique pour reprendre de la vitesse';
    else if (bounds !== 'ok') msg = 'Limite de zone : fais demi-tour';
    else if (game.runwayDestroyed && game.phase !== 'preflight') msg = 'Piste détruite !';
    else if (fuelPct < 0.15) msg = 'Carburant bas : retourne à la piste';
    else if (!f.onGround && gearDown(f, game.layout.runway)) msg = 'Train sorti';
    this.msg.textContent = msg;
    this.msg.classList.toggle('warn', msg !== '' && msg !== 'Train sorti');

    this.toastTimer -= dt;
    if (this.toastTimer <= 0) this.toast.style.opacity = '0';

    // Gun cross: where the bullets go, 300 m ahead
    this.place(this.cross, projectToScreen(this._p.copy(f.position).addScaledVector(forwardOf(f), 300), cam, w, h));

    // Enemy markers, lead indicators and off-screen arrows
    let i = 0;
    for (const e of game.enemies) {
      if (i >= MAX_MARKERS) break;
      const dist = e.flight.position.distanceTo(f.position);
      const s = projectToScreen(e.flight.position, cam, w, h);
      const m = this.markers[i], l = this.leads[i], a = this.arrows[i];
      m.classList.toggle('bomber', e.kind === 'bomber');
      if (s.onScreen) {
        this.place(m, s);
        m.textContent = dist > 250 ? `${Math.round(dist)}` : '';
        a.style.display = 'none';
      } else {
        m.style.display = 'none';
        this.edge(a, e.flight.position, cam, w, h);
      }
      const lp = shouldShowLead(dist, easyMode) ? leadPoint(f.position, f.velocity, e.flight.position, e.flight.velocity, CONFIG.bullets.speed) : null;
      if (lp) this.place(l, projectToScreen(lp, cam, w, h));
      else l.style.display = 'none';
      i++;
    }
    for (; i < MAX_MARKERS; i++) {
      this.markers[i].style.display = 'none';
      this.leads[i].style.display = 'none';
      this.arrows[i].style.display = 'none';
    }

    // Runway
    const rw = game.layout.runway.center;
    const needs = fuelPct < 0.25 || ammo < CONFIG.resources.ammo * 0.2 || p.damage.hp < 60;
    const rs = projectToScreen(this._p.copy(rw).setY(2), cam, w, h);
    this.runwayArrow.classList.toggle('pulse', needs);
    if (f.onGround) { this.runwayMark.style.display = 'none'; this.runwayArrow.style.display = 'none'; }
    else if (rs.onScreen) { this.place(this.runwayMark, rs); this.runwayArrow.style.display = 'none'; }
    else { this.runwayMark.style.display = 'none'; this.edge(this.runwayArrow, this._p, cam, w, h); }
  }

  private place(el: HTMLElement, s: { x: number; y: number; onScreen: boolean }): void {
    if (!s.onScreen) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.transform = `translate(${s.x}px, ${s.y}px)`;
  }

  private edge(el: HTMLElement, p: THREE.Vector3, cam: THREE.Camera, w: number, h: number): void {
    const { angle } = edgeArrow(p, cam);
    const r = Math.min(w, h) / 2 - 36;
    el.style.display = '';
    el.style.transform = `translate(${w / 2 + Math.cos(angle) * r}px, ${h / 2 + Math.sin(angle) * r}px) rotate(${angle}rad)`;
  }
}
