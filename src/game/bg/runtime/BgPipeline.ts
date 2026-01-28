
import { BgPreset } from "../schema/BgPreset";
import { BgSnapshot } from "./BgSnapshot";
import { BgDrawCtx } from "./BgDrawCtx";
import { BaseRenderer } from "./base/BaseRenderer";
import { createRenderer } from "./base/createRenderer";

export class BgPipeline {
  private renderers = new Map<string, { kind: string; r: BaseRenderer }>();
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
    const next: BgSnapshot = { preset, resolvedSeed: (preset as any).seed ?? 0 };

    // First set: just store snapshot; renderers are lazy-created per layer in draw()
    if (!this.snapshot) {
      this.snapshot = next;
      return;
    }

    // Dispose renderers for removed layers or kind changes
    const prev = this.snapshot.preset as any;
    const cur = preset as any;

    const prevLayers: any[] = Array.isArray(prev?.layers) ? prev.layers : [];
    const curLayers: any[] = Array.isArray(cur?.layers) ? cur.layers : [];

    const curById = new Map(curLayers.map(l => [String(l.id), l]));

    for (const [layerId, ent] of this.renderers) {
      const l2 = curById.get(layerId);
      if (!l2) {
        ent.r.dispose();
        this.renderers.delete(layerId);
        continue;
      }
      const nextKind = String(l2.kind ?? "");
      if (nextKind && ent.kind !== nextKind) {
        ent.r.dispose();
        this.renderers.delete(layerId);
      }
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
    if (!this.snapshot || !this.gl) return;

    const preset: any = this.snapshot.preset ?? {};
    const common: any = preset.common ?? {};
    const quality: any = preset.quality ?? {};
    const layers: any[] = Array.isArray(preset.layers) ? preset.layers : [];

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

    // --- auto-scroll X (px/sec)
    const tSec = Number((ctx as any).timeSec ?? (ctx as any).time ?? 0);
    const dt = this.lastTimeSec > 0 ? Math.max(0, tSec - this.lastTimeSec) : 0;
    this.lastTimeSec = tSec;

    const scrollSpeedX = Number(common.scrollSpeedX ?? 0);
    if (Number.isFinite(scrollSpeedX)) {
      this.autoX += scrollSpeedX * dt;
    }

    const baseScroll = {
      x: ctxX + this.autoX + Number(common.scrollX ?? 0),
      y: ctxY + Number(common.scrollY ?? 0),
    };

    // blend setup (we will override per-layer)
    const gl = this.gl;
    gl.enable(gl.BLEND);

    for (const layer of layers) {
      if (!layer || typeof layer !== "object") continue;
      if (layer.enabled === false) continue;

      const layerId = String(layer.id ?? "");
      const kind = String(layer.kind ?? "");
      if (!layerId || !kind) continue;

      // get or create renderer per layerId
      let ent = this.renderers.get(layerId);
      if (!ent) {
        const r = createRenderer(kind);
        r.init(gl, this.w, this.h);

        // one-time rebuild (best-effort)
        try {
          r.rebuild({});
        } catch {}
        ent = { kind, r };
        this.renderers.set(layerId, ent);
      }

      // per-layer parallax
      const parMul = Number(layer.parallaxMul ?? 1);
      const effScroll = {
        x: baseScroll.x * (Number.isFinite(parMul) ? parMul : 1),
        y: baseScroll.y * (Number.isFinite(parMul) ? parMul : 1),
      };

      // opacity via constant alpha blend
      const opacity = Math.max(0, Math.min(1, Number(layer.opacity ?? 1)));
      gl.blendColor(0, 0, 0, opacity);

      const blend = String(layer.blend ?? "alpha");
      if (blend === "add") {
        // src * constA + dst * 1
        gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE);
        gl.blendEquation(gl.FUNC_ADD);
      } else {
        // alpha: src * constA + dst * (1 - constA)
        gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
        gl.blendEquation(gl.FUNC_ADD);
      }

      // Build params object expected by renderers (common + kind block)
      const params = {
        common,
        quality,
        shader: layer?.params?.shader ?? {},
        flow: layer?.params?.flow ?? {},
      };

      ent.r.setUniforms(params, (ctx as any).time, effScroll, null);
      ent.r.draw();

        // NOTE: some BG renderers touch global BLEND state (FlowRibbon/FlowSegments/Demoscene).
        // Re-apply pipeline-managed blend state so NEXT layer opacity/blend stays correct.
        gl.enable(gl.BLEND);
        gl.blendColor(0, 0, 0, opacity);
        if (blend === "add") {
          gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE);
          gl.blendEquation(gl.FUNC_ADD);
        } else {
          gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
          gl.blendEquation(gl.FUNC_ADD);
        }

}

    // Optional: keep blending enabled for the rest of pipeline or disable:
    // gl.disable(gl.BLEND);
  }

  dispose(): void {
    for (const ent of this.renderers.values()) {
      try { ent.r.dispose(); } catch {}
    }
    this.renderers.clear();
  }
}