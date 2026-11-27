/** Engine sound parameters: pure, for tests. `t` is time in seconds. */
export function engineParams(throttle: number, damaged: boolean, t: number): { freq: number; gain: number } {
  const freq = 38 + 70 * throttle;
  let gain = 0.05 + 0.06 * throttle;
  if (damaged) {
    // Irregular sputter: two incommensurate sines, gated.
    const s = Math.sin(t * 23.7) + Math.sin(t * 9.1 + 1.3);
    if (s > 1.1) gain *= 0.25;
  }
  return { freq, gain };
}

type SfxType = 'fire' | 'enemyFire' | 'hit' | 'explosion' | 'bigExplosion' | 'alarm' | 'landed';

/** All sounds synthesised with Web Audio: no files to download. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineOsc!: OscillatorNode;
  private engineGain!: GainNode;
  private noise!: AudioBuffer;
  private volume = 0.7;
  private lastPlayed = new Map<SfxType, number>();

  /** Create the audio context; must run inside a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.value = v;
  }

  /** Engine drone; call every frame. Pass running=false to silence it. */
  setEngine(throttle: number, damaged: boolean, running = true): void {
    if (!this.ctx) return;
    const p = engineParams(throttle, damaged, this.ctx.currentTime);
    const now = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(p.freq, now, 0.08);
    this.engineGain.gain.setTargetAtTime(running ? p.gain : 0, now, 0.05);
  }

  private burst(duration: number, filterType: BiquadFilterType, freq: number, gain: number, freqEnd?: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, now);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(now, Math.random() * 0.5);
    src.stop(now + duration + 0.05);
  }

  private beep(freq: number, duration: number, gain: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    o.connect(g).connect(this.master);
    o.start(now);
    o.stop(now + duration + 0.02);
  }

  /** `volume` scales the sound (e.g. by distance). Rate-limited per sound type. */
  play(type: SfxType, volume = 1): void {
    if (!this.ctx || volume <= 0.01) return;
    const now = this.ctx.currentTime;
    const minGap = type === 'fire' || type === 'enemyFire' ? 0.05 : type === 'alarm' ? 0.9 : 0.03;
    if (now - (this.lastPlayed.get(type) ?? -1) < minGap) return;
    this.lastPlayed.set(type, now);
    switch (type) {
      case 'fire': this.burst(0.07, 'bandpass', 1800, 0.35 * volume); break;
      case 'enemyFire': this.burst(0.06, 'bandpass', 1400, 0.25 * volume); break;
      case 'hit': this.burst(0.05, 'highpass', 3000, 0.4 * volume); break;
      case 'explosion': this.burst(1.0, 'lowpass', 900, 0.8 * volume, 60); break;
      case 'bigExplosion': this.burst(1.8, 'lowpass', 700, 1.0 * volume, 40); break;
      case 'alarm': this.beep(880, 0.25, 0.12 * volume); break;
      case 'landed': this.beep(520, 0.12, 0.08 * volume); break;
    }
  }
}
