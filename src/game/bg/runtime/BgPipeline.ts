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
      this.renderer.rebuild(preset.base);
    }

    this.snapshot = next;
  }

  private createRenderer(snapshot: BgSnapshot) {
    if (!this.gl) return;
    this.renderer = createRenderer(snapshot.preset.kind);
    this.renderer.init(this.gl, this.w, this.h);
  }

  private disposeRenderer() {
    this.renderer?.dispose();
    this.renderer = null;
  }

  draw(ctx: BgDrawCtx): void {
    if (!this.renderer || !this.snapshot) return;
    this.renderer.setUniforms(this.snapshot.preset.base ?? {}, ctx.time, ctx.scroll, null);
    this.renderer.draw();
  }

  dispose(): void {
    this.disposeRenderer();
  }
}
