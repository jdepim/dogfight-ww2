import { CONFIG } from '../config';

export function waveComposition(n: number): { fighters: number; bombers: number; escorts: number; skill: number } {
  const W = CONFIG.waves;
  const bomberWave = n > 0 && n % W.bomberEvery === 0;
  return {
    fighters: Math.min(1 + n, W.maxFighters),
    bombers: bomberWave ? n / W.bomberEvery : 0,
    escorts: bomberWave ? 2 : 0,
    skill: Math.min(1, 0.2 + 0.08 * n),
  };
}
