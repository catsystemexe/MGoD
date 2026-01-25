
import { BaseRenderer } from "./BaseRenderer";
import { FlowSegmentsBg } from "../../../..//render/webgl/bg/FlowSegmentsBg";

export class FlowSegmentsRenderer implements BaseRenderer {
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

    // FlowSegmentsBg ctor expects gl (per grep output). Build it here.
    this.impl = new (FlowSegmentsBg as any)(gl);
  }

  rebuild(params: any): void {
    this.params = params ?? {};
    try {
      this.impl?.rebuild?.(this.buildPreset(this.params));
    } catch {
      // ignore
    }
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

    const scrollX = Number(common.scrollX ?? 0);
    const scrollY = Number(common.scrollY ?? 0);

    const preset = this.buildPreset(p);

    this.impl.draw({
      logicW: this.w,
      logicH: this.h,
      timeSec: this.timeSec,
      scrollX,
      scrollY,
      preset,
    });
  }

  private buildPreset(params: any) {
    const flow = params.flow ?? {};
    return {
      segments: {
        speed: Number(flow.speed ?? 1),
        curl: Number(flow.curl ?? 1),
        jitter: Number(flow.jitter ?? 0),
        thicknessPx: Number(flow.thickness ?? 1),
        alpha: Number(flow.alpha ?? 1),

        segmentCount: Math.floor(Number(flow.segmentCount ?? 512)),
        segmentLen: Math.floor(Number(flow.segmentLen ?? 8)),
        gridW: Math.floor(Number(flow.gridW ?? 64)),
        gridH: Math.floor(Number(flow.gridH ?? 64)),
      },
      color: [1, 1, 1, 1],
    };
  }

  dispose(): void {
    try { this.impl?.dispose?.(); } catch {}
    this.impl = null;
    this.gl = null;
  }
}
