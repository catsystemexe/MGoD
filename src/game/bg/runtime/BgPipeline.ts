
import { BgPreset } from "../schema/BgPreset";
import { BgSnapshot } from "./BgSnapshot";
import { BgDrawCtx } from "./BgDrawCtx";
import { BaseRenderer } from "./base/BaseRenderer";
import { createRenderer } from "./base/createRenderer";
import { diffPreset } from "./BgRuntimeDiff";

export class BgPipeline {
  private renderer: BaseRenderer | null = null;
  private snapshot: BgSnapshot | null = null;

  private gl: WebGL2RenderingContext | null = null;
  private w = 0;
  private h = 0;

  private lastTimeSec = 0;
  private autoX = 0;

  init(gl: WebGL2RenderingContext, w: number, h: number) {
    this.gl = gl;
    this.w = w;
    this.h = h;
  }

  setPreset(preset: BgPreset): void {
    const next: BgSnapshot = { preset, resolvedSeed: preset.seed };

    if (!this.snapshot) {
      this.createRenderer(next);
      this.snapshot = next;
      return;
    }

    const diff = diffPreset(this.snapshot.preset, preset);

    if (diff.structural) {
      this.disposeRenderer();
      this.createRenderer(next);
    } else if (diff.rebuild && this.renderer) {
      // Rebuild with BgBase (contains common/quality + kind-specific block)
      this.renderer.rebuild(preset.base);
    }

    this.snapshot = next;
  }

  private createRenderer(snapshot: BgSnapshot) {
    if (!this.gl) return;

    this.renderer = createRenderer(snapshot.preset.kind);
    this.renderer.init(this.gl, this.w, this.h);

    // IMPORTANT: many BG implementations need rebuild() at least once to allocate buffers.
    const params =
      (snapshot.preset as any).base ??
      (snapshot.preset as any).flow ??
      (snapshot.preset as any).shader ??
      (snapshot.preset as any);

    try {
      this.renderer.rebuild(params);
    } catch (e) {
      // never fail boot because BG rebuild failed
      // eslint-disable-next-line no-console
      console.warn("[BG] initial rebuild failed", e);
    }
  }

  private disposeRenderer() {
    this.renderer?.dispose();
    this.renderer = null;
  }

  draw(ctx: BgDrawCtx): void {
    if (!this.renderer || !this.snapshot) return;

    const base: any = this.snapshot.preset.base ?? {};
    const common: any = base.common ?? {};

    const rawScroll: any = (ctx as any).scroll;

    // ctx.scroll může být legacy number nebo {x,y}
    const ctxX =
      rawScroll && typeof rawScroll === "object"
        ? Number(rawScroll.x ?? 0)
        : Number(rawScroll ?? 0);

    const ctxY =
      rawScroll && typeof rawScroll === "object"
        ? Number(rawScroll.y ?? 0)
        : 0;

    // --- auto-scroll X driven by UI (px/sec); 0 => no motion
    const tSec = Number((ctx as any).timeSec ?? (ctx as any).time ?? 0);
    const dt = this.lastTimeSec > 0 ? Math.max(0, tSec - this.lastTimeSec) : 0;
    this.lastTimeSec = tSec;

    const scrollSpeedX = Number(common.scrollSpeedX ?? 0);
    if (Number.isFinite(scrollSpeedX)) {
      this.autoX += scrollSpeedX * dt;
    }

    // Effective scroll:
    // - X: world scroll (ctxX) + autoX + manual offsets
    // - Y: world scroll (ctxY) + manual offsets
    const effScroll = {
      x: ctxX + this.autoX + Number(common.scrollX ?? 0),
      y: ctxY + Number(common.scrollY ?? 0),
    };

    this.renderer.setUniforms(base, (ctx as any).time, effScroll, null);
    this.renderer.draw();
  }

  dispose(): void {
    this.disposeRenderer();
  }
}