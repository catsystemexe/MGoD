import { BaseRenderer } from "./BaseRenderer";
import { DemosceneBg } from "../../../../render/webgl/bg/DemosceneBg";

export class ShaderBgRenderer implements BaseRenderer {
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
    const s = _scroll as any;
    this.scrollX = Number(s?.x ?? 0);
    this.scrollY = Number(s?.y ?? 0);
  }

  draw(): void {
    if (!this.gl || !this.impl) return;

    const p = this.params ?? {};
    const common = p.common ?? {};
    const sh = p.shader ?? {};

    const mul = Number(common.scrollMul ?? 1);
    const scrollX = (this.scrollX + Number(common.scrollX ?? 0)) * mul;
    const scrollY = (this.scrollY + Number(common.scrollY ?? 0)) * mul;

    // Support both string preset and legacy presetIndex (if any)
    // Map string -> BG_PRESETS index (see src/render/webgl/bg/bgPresets.ts)
    const presetStr = String(sh.preset ?? "");
    const presetIndexRaw = Number(sh.presetIndex ?? NaN);

    const presetIndex =
      presetStr === "tempest" ? 0 :
      presetStr === "grid" ? 1 :
      presetStr === "plasma" ? 2 :
      presetStr === "nebula" ? 2 :
      presetStr === "kaleido" ? 3 :
      presetStr === "stripes" ? 4 :
      presetStr === "star" ? 4 :
      presetStr === "hex" ? 5 :
      (Number.isFinite(presetIndexRaw) ? (presetIndexRaw | 0) : 0);

    const a = Number(sh.a ?? 0);
    const b = Number(sh.b ?? 0);
    const warp = Number(sh.warp ?? 0);
    const grain = Number(sh.grain ?? 0);

    const exposure = Number(common.exposure ?? 1);
    const contrast = Number(common.contrast ?? 1);
    const gamma = Number(common.gamma ?? 1);
    const colorize = Number(common.colorize ?? 0);
    const vignette = Number(common.vignette ?? 0);
    const bgFade = Number(common.bgFade ?? 0);

    const p2DefaultsForMode = (mode: number): [number, number, number, number] => {
      switch (mode | 0) {
        case 0: return [0.020, 12.0, 0.15, 0.15]; // Tempest: ringScale, spokeFreq, rotAmp, parallax
        case 1: return [0.06,  0.10, 1.0,  0.0 ]; // Grid warp: rotAmp, parallax, glowPow, spare
        case 2: return [0.55,  0.03, 0.06, 0.0 ]; // Plasma scan: scanAmp, rotAmp, parallax, spare
        case 3: return [0.10,  0.08, 1.0,  0.0 ]; // Kaleido: rotAmp, parallax, glowPow, spare
        case 4: return [0.08,  0.12, 1.0,  0.0 ]; // Star wire: rotAmp, parallax, glowPow, spare
        default:return [0.05,  0.10, 1.0,  0.0 ]; // Hex: rotAmp, parallax, glowPow, spare
      }
    };

    
    // Optional overrides: if provided, patch BG_PRESETS via presetIndex by using DemosceneBg's presetIndex,
    // and let DemosceneBg pick the preset from bgPresets.ts.
    // If you later want live overrides, we can add a controlled "preset override" toggle.
    this.impl.draw({
      logicW: this.w,
      logicH: this.h,
      timeSec: this.timeSec,
      scrollX,
      scrollY,

      presetIndex,

      // post
      exposure,
      contrast,
      gamma,
      colorize,
      vignette,
      bgFade,
    });
  }

  dispose(): void {
    try { this.impl?.dispose?.(); } catch {}
    this.impl = null;
    this.gl = null;
  }
}
