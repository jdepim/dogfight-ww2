/** Fixed-timestep loop: simulation at a constant step, rendering interpolated. */
export class FixedLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;

  constructor(
    private readonly step: number,
    private readonly maxFrame: number,
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number) => void,
  ) {}

  /** Advance by a real elapsed time; returns the number of simulation steps run. */
  advance(realDt: number): number {
    this.acc += Math.min(Math.max(realDt, 0), this.maxFrame);
    let n = 0;
    while (this.acc >= this.step - 1e-9) {
      this.update(this.step);
      this.acc -= this.step;
      n++;
    }
    if (this.acc < 0) this.acc = 0;
    this.render(Math.min(this.acc / this.step, 0.999999));
    return n;
  }

  start(): void {
    this.last = performance.now();
    const tick = (t: number) => {
      this.advance((t - this.last) / 1000);
      this.last = t;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }
}
