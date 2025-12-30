/**
 * Lightweight perf stats (Phase1).
 * - last ms for fixed/ca/render
 * - rolling avg (EMA)
 * - worst frame dt (from RAF delta)
 */
export class Perf {
  lastFixedMs = 0;
  lastCaMs = 0;
  lastRenderMs = 0;

  avgFixedMs = 0;
  avgCaMs = 0;
  avgRenderMs = 0;

  lastFrameMs = 0;
  worstFrameMs = 0;

  private ema(a: number, b: number, k = 0.1): number {
    return a === 0 ? b : (a + (b - a) * k);
  }

  onFixed(ms: number): void {
    this.lastFixedMs = ms;
    this.avgFixedMs = this.ema(this.avgFixedMs, ms);
  }

  onCA(ms: number): void {
    this.lastCaMs = ms;
    this.avgCaMs = this.ema(this.avgCaMs, ms);
  }

  onRender(ms: number): void {
    this.lastRenderMs = ms;
    this.avgRenderMs = this.ema(this.avgRenderMs, ms);
  }

  onFrameDelta(ms: number): void {
    this.lastFrameMs = ms;
    if (ms > this.worstFrameMs) this.worstFrameMs = ms;
    // keep worst bounded: if it gets absurd (tab switch), clamp
    if (this.worstFrameMs > 250) this.worstFrameMs = 250;
  }

  resetWorst(): void {
    this.worstFrameMs = this.lastFrameMs;
  }
}
