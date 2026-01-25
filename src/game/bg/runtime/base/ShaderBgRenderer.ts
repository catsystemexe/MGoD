import { BaseRenderer } from "./BaseRenderer";
import { DemosceneBg } from "../../../..//render/webgl/bg/DemosceneBg";

export class ShaderBgRenderer implements BaseRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private w = 0;
  private h = 0;

  private impl: any = null;

  private params: any = null;
  private timeSec = 0;

  init(gl: WebGL2RenderingContext, w: number, h: number): void {
    this.gl = gl;
    this.w = w;
    this.h = h;

    // DemosceneBg ctor expects gl (per grep output). Build it here.
    this.impl = new (DemosceneBg as any)(gl);
  }

  rebuild(params: any): void {
    this.params = params ?? {};
  }

  setUniforms(params: any, time: number, _scroll: any, _audio: any): void {
    // Never block drawing because params missing.
    this.params = params ?? {};
    const ts = Number(this.params?.common?.timeScale ?? 1);
    this.timeSec = Number(time ?? 0) * ts;
  }

  draw(): void {
    if (!this.gl || !this.impl) return;

    const p = this.params ?? {};
    const common = p.common ?? {};
    const sh = p.shader ?? {};

    const scrollX = Number(common.scrollX ?? 0);
    const scrollY = Number(common.scrollY ?? 0);

    // Support both string preset and legacy presetIndex (if any)
    const presetStr = String(sh.preset ?? "");
    const presetIndex = Number(sh.presetIndex ?? NaN);

    const mode =
      presetStr === "plasma" ? 1 :
      presetStr === "nebula" ? 2 :
      presetStr === "stripes" ? 3 :
      Number.isFinite(presetIndex) ? presetIndex : 0;

    const a = Number(sh.a ?? 0);
    const b = Number(sh.b ?? 0);
    const warp = Number(sh.warp ?? 0);
    const grain = Number(sh.grain ?? 0);

    const exposure = Number(common.exposure ?? 1);
    const contrast = Number(common.contrast ?? 1);
    const gamma = Number(common.gamma ?? 1);
    const colorize = Number(common.colorize ?? 0);

    this.impl.draw({
      logicW: this.w,
      logicH: this.h,
      timeSec: this.timeSec,
      scrollX,
      scrollY,
      preset: {
        mode,
        p1: [a, b, warp, grain],
        p2: [exposure, contrast, gamma, colorize],
        cA: [0.15, 0.18, 0.22],
        cB: [1.0, 1.0, 1.0],
      },
    });
  }

  dispose(): void {
    try { this.impl?.dispose?.(); } catch {}
    this.impl = null;
    this.gl = null;
  }
}
