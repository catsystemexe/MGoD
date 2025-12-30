export type LoopHooks = {
  fixedUpdate: (dtSec: number) => void;     // 60Hz
  render: (alpha: number, frameDtSec: number) => void; // visual tick
  caUpdate?: (dtSec: number) => void;       // 15Hz
};

export class Loop {
  private rafId: number | null = null;
  private intervalId: number | null = null;

  private running = false;

  private lastMs = 0;
  private accMs = 0;
  private caAccMs = 0;

  private readonly dtMs: number;
  private readonly dtSec: number;
  private readonly caDtMs: number;
  private readonly caDtSec: number;

  // If RAF slows below this, we switch to interval rendering
  private readonly RAF_THROTTLE_MS = 120;

  // Keep a short history to detect throttling robustly
  private slowFrames = 0;

  constructor(fixedHz: number, caHz: number) {
    if (fixedHz <= 0 || caHz <= 0) throw new Error("Hz must be > 0");
    this.dtMs = 1000 / fixedHz;
    this.dtSec = this.dtMs / 1000;
    this.caDtMs = 1000 / caHz;
    this.caDtSec = this.caDtMs / 1000;
  }

  start(hooks: LoopHooks): void {
    if (this.running) return;
    this.running = true;

    this.lastMs = performance.now();
    this.accMs = 0;
    this.caAccMs = 0;
    this.slowFrames = 0;

    const tick = (nowMs: number) => {
      if (!this.running) return;

      let deltaMs = nowMs - this.lastMs;
      if (deltaMs > 250) deltaMs = 250; // clamp
      this.lastMs = nowMs;

      this.accMs += deltaMs;
      this.caAccMs += deltaMs;

      while (this.accMs >= this.dtMs) {
        hooks.fixedUpdate(this.dtSec);
        this.accMs -= this.dtMs;
      }

      if (hooks.caUpdate) {
        while (this.caAccMs >= this.caDtMs) {
          hooks.caUpdate(this.caDtSec);
          this.caAccMs -= this.caDtMs;
        }
      } else {
        if (this.caAccMs > this.caDtMs * 4) this.caAccMs = 0;
      }

      const alpha = this.accMs / this.dtMs;
      hooks.render(alpha, deltaMs / 1000);

      // Detect throttled RAF (common on iPad embedded previews)
      if (deltaMs >= this.RAF_THROTTLE_MS) this.slowFrames++;
      else this.slowFrames = Math.max(0, this.slowFrames - 1);

      // Switch to interval if throttled consistently
      if (this.slowFrames >= 8) {
        this.startInterval(hooks);
        return;
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private startInterval(hooks: LoopHooks): void {
    if (!this.running) return;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // 60Hz-ish interval visual tick
    const targetMs = 16;
    this.lastMs = performance.now();

    this.intervalId = window.setInterval(() => {
      const now = performance.now();
      // run the same tick body
      let deltaMs = now - this.lastMs;
      if (deltaMs > 250) deltaMs = 250;
      this.lastMs = now;

      this.accMs += deltaMs;
      this.caAccMs += deltaMs;

      while (this.accMs >= this.dtMs) {
        hooks.fixedUpdate(this.dtSec);
        this.accMs -= this.dtMs;
      }

      if (hooks.caUpdate) {
        while (this.caAccMs >= this.caDtMs) {
          hooks.caUpdate(this.caDtSec);
          this.caAccMs -= this.caDtMs;
        }
      }

      const alpha = this.accMs / this.dtMs;
      hooks.render(alpha, deltaMs / 1000);
    }, targetMs);
  }

  stop(): void {
    this.running = false;

    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;

    if (this.intervalId !== null) clearInterval(this.intervalId);
    this.intervalId = null;
  }
}
