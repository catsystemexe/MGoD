import { BaseRenderer } from "./BaseRenderer";
import { FlowSegmentsBg, FLOW_PRESETS } from "../../../..//render/webgl/bg/FlowSegmentsBg";

export class FlowSegmentsRenderer implements BaseRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private w = 0;
  private h = 0;

  private impl: any = null;

  private params: any = null;
  private timeSec = 0;
  private scrollX = 0;
  private scrollY = 0;

  init(gl: WebGL2RenderingContext, w: number, h: number): void {
    this.gl = gl;
    this.w = w;
    this.h = h;

    // FlowSegmentsBg ctor expects gl. Build it here.
    this.impl = new (FlowSegmentsBg as any)(gl);
  }

  rebuild(params: any): void {
    // FlowSegmentsBg has no public rebuild(); it rebuilds internally in draw() via rebuildIfNeeded().
    this.params = params ?? {};
  }

  setUniforms(params: any, time: number, _scroll: any, _audio: any): void {
    // Never block drawing because params missing.
    this.params = params ?? {};
    const ts = Number(this.params?.common?.timeScale ?? 1);
    this.timeSec = Number(time ?? 0) * ts;

    const s = _scroll as any;
    this.scrollX = Number(s?.x ?? 0);
    this.scrollY = Number(s?.y ?? 0);
  }

  draw(): void {
    if (!this.gl || !this.impl) return;
    const dbg = (globalThis as any).__CM_BG_DEBUG;
    if (dbg) {
    }
    const gl = this.gl;

   

    
    const p = this.params ?? {};
    const common = p.common ?? {};

    const mul = Number(common.scrollMul ?? 1);
    const scrollX = (this.scrollX + Number(common.scrollX ?? 0)) * mul;
    const scrollY = (this.scrollY + Number(common.scrollY ?? 0)) * mul;

    const presetIndex = this.resolvePresetIndex(p);

    this.impl.draw({
      logicW: this.w,
      logicH: this.h,
      timeSec: this.timeSec,
      scrollX,
      scrollY,
      presetIndex,
    });
  }

  private resolvePresetIndex(params: any): number {
    const flow = params?.flow ?? {};

    // Prefer presetId -> lookup in FLOW_PRESETS
    const presetId = typeof flow.presetId === "string" ? flow.presetId : "";
    if (presetId) {
      const ix = (FLOW_PRESETS as any[]).findIndex((p: any) => p?.id === presetId);
      if (ix >= 0) return ix;
    }

    // Fallback numeric index
    const ixNum = Number(flow.presetIndex ?? flow.preset ?? 0);
    return Number.isFinite(ixNum) ? (ixNum | 0) : 0;
  }

  dispose(): void {
    try { this.impl?.dispose?.(); } catch {}
    this.impl = null;
    this.gl = null;
  }
}
