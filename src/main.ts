import { CONFIG } from './config';
import { FixedLoop } from './core/loop';

const loop = new FixedLoop(CONFIG.sim.step, CONFIG.sim.maxFrame, () => {}, () => {});
loop.start();
