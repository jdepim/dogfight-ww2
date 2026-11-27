import type { Phase } from '../game/game';
import type { ScoreState } from '../game/score';

export interface Settings {
  easyMode: boolean;
  invertY: boolean;
  sensitivity: number; // 0.5..2 multiplier
  volume: number; // 0..1
}

const SETTINGS_KEY = 'dogfight-ww2.settings';
export const DEFAULT_SETTINGS: Settings = { easyMode: false, invertY: false, sensitivity: 1, volume: 0.7 };

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(s: Settings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export interface MenuInfo {
  wave: number;
  score: ScoreState;
  best: number;
  newRecord: boolean;
  reason?: string;
  device: 'desktop' | 'touch';
}

export interface MenuCallbacks {
  onStart: () => void;
  onResume: () => void;
  onQuit: () => void;
  onSettings: (s: Settings) => void;
}

const HELP_DESKTOP = `
<div class="help"><b>Commandes</b><br>
Souris : manche (tangage / roulis) — clic dans le jeu pour la capturer<br>
Z / W : plus de gaz · S : moins de gaz · Q / A et D : palonnier<br>
Clic gauche ou Espace : tir · Flèches : manche au clavier<br>
C : caméra cible · Échap : pause</div>`;
const HELP_TOUCH = `
<div class="help"><b>Commandes</b><br>
Joystick à gauche : manche · Curseur à droite : gaz · Bouton FEU : tir</div>`;
const TIPS = `<div class="tips">Décolle : plein gaz, puis tire le manche au-dessus de 160 km/h.<br>
Pour réparer et recharger : pose-toi doucement sur la piste (moins de 215 km/h, ailes à plat) et arrête-toi.</div>`;

export class Menus {
  private panels: Record<'menu' | 'paused' | 'gameover' | 'settings', HTMLElement>;
  private settings: Settings = loadSettings();
  private settingsReturn: 'menu' | 'paused' = 'menu';
  private last: { phase: Phase; info: MenuInfo } | null = null;

  constructor(root: HTMLElement, private cb: MenuCallbacks) {
    const mk = (cls: string) => {
      const d = document.createElement('div');
      d.className = `panel ${cls}`;
      d.style.display = 'none';
      root.appendChild(d);
      d.addEventListener('click', (e) => this.onClick(e));
      d.addEventListener('input', (e) => this.onInput(e));
      return d;
    };
    this.panels = { menu: mk('menu'), paused: mk('paused'), gameover: mk('gameover'), settings: mk('settings') };
    const orient = document.createElement('div');
    orient.className = 'orientation';
    orient.innerHTML = '<div>📱↻<br>Tourne ton téléphone<br>en mode paysage</div>';
    root.appendChild(orient);
  }

  get current(): Settings {
    return this.settings;
  }

  private onClick(e: Event): void {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (!a) return;
    switch (a) {
      case 'start': this.cb.onStart(); break;
      case 'resume': this.cb.onResume(); break;
      case 'quit': this.cb.onQuit(); break;
      case 'settings':
        this.settingsReturn = this.last?.phase === 'paused' ? 'paused' : 'menu';
        this.showOnly('settings');
        this.renderSettings();
        break;
      case 'back':
        if (this.last) this.show(this.settingsReturn === 'paused' ? 'paused' : this.last.phase, this.last.info);
        break;
    }
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    const k = t.dataset.setting as keyof Settings | undefined;
    if (!k) return;
    if (t.type === 'checkbox') (this.settings[k] as boolean) = t.checked;
    else (this.settings[k] as number) = Number(t.value);
    saveSettings(this.settings);
    this.cb.onSettings(this.settings);
  }

  private showOnly(name: keyof Menus['panels'] | null): void {
    for (const [k, p] of Object.entries(this.panels)) p.style.display = k === name ? '' : 'none';
  }

  show(phase: Phase, info: MenuInfo): void {
    this.last = { phase, info };
    const help = info.device === 'touch' ? HELP_TOUCH : HELP_DESKTOP;
    switch (phase) {
      case 'menu':
        this.panels.menu.innerHTML = `<h1>DOGFIGHT<span>WW2</span></h1>
          <p class="sub">Survis aux vagues d'ennemis. Défends ta piste.</p>
          <button data-action="start" class="big">Jouer</button>
          <button data-action="settings">Réglages</button>
          <p class="best">Meilleur score : ${info.best}</p>${help}${TIPS}`;
        this.showOnly('menu');
        break;
      case 'paused':
        this.panels.paused.innerHTML = `<h2>Pause</h2>
          <button data-action="resume" class="big">Reprendre</button>
          <button data-action="settings">Réglages</button>
          <button data-action="quit">Abandonner</button>${help}`;
        this.showOnly('paused');
        break;
      case 'gameover': {
        const s = info.score;
        const acc = s.shots ? Math.round((100 * s.hits) / s.shots) : 0;
        this.panels.gameover.innerHTML = `<h2>${escapeHtml(info.reason ?? 'Fin de partie')}</h2>
          <table>
            <tr><td>Vague atteinte</td><td>Vague ${info.wave}</td></tr>
            <tr><td>Victoires</td><td>${s.kills}</td></tr>
            <tr><td>Précision</td><td>${acc} %</td></tr>
            <tr><td>Vagues sans escale</td><td>${s.nonStopWaves}</td></tr>
            <tr class="total"><td>Score</td><td>${s.points}</td></tr>
          </table>
          <p class="best">${info.newRecord ? '🏆 Nouveau record !' : `Record : ${info.best}`}</p>
          <button data-action="start" class="big">Rejouer</button>
          <button data-action="quit">Menu</button>`;
        this.showOnly('gameover');
        break;
      }
      default:
        this.showOnly(null);
    }
  }

  private renderSettings(): void {
    const s = this.settings;
    this.panels.settings.innerHTML = `<h2>Réglages</h2>
      <label><input type="checkbox" data-setting="easyMode" ${s.easyMode ? 'checked' : ''}> Mode facile (aide à la visée permanente)</label>
      <label><input type="checkbox" data-setting="invertY" ${s.invertY ? 'checked' : ''}> Inverser l'axe vertical</label>
      <label>Sensibilité de la souris <input type="range" min="0.4" max="2.5" step="0.1" data-setting="sensitivity" value="${s.sensitivity}"></label>
      <label>Volume <input type="range" min="0" max="1" step="0.05" data-setting="volume" value="${s.volume}"></label>
      <button data-action="back" class="big">Retour</button>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
