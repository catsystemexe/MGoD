import { BgPreset } from "../schema/BgPreset";
import { BgSnapshot } from "./BgSnapshot";
import { BgDrawCtx } from "./BgDrawCtx";
import { BaseRenderer } from "./base/BaseRenderer";
import { createRenderer } from "./base/createRenderer";

type BgGlState = {
  fb: WebGLFramebuffer | null;
  prog: WebGLProgram | null;
  vao: WebGLVertexArrayObject | null;
  viewport: Int32Array;
  scissorEnabled: boolean;
  scissorBox: Int32Array;

  blendEnabled: boolean;
  blendSrcRGB: number;
  blendDstRGB: number;
  blendSrcA: number;
  blendDstA: number;
  blendEqRGB: number;
  blendEqA: number;
  blendColor: Float32Array;

  activeTex: number;
  tex2d: WebGLTexture | null;
};

function captureBgGlState(gl: WebGL2RenderingContext): BgGlState {
  return {
    fb: gl.getParameter(gl.FRAMEBUFFER_BINDING),
    prog: gl.getParameter(gl.CURRENT_PROGRAM),
    vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
    viewport: gl.getParameter(gl.VIEWPORT),
    scissorEnabled: gl.isEnabled(gl.SCISSOR_TEST),
    scissorBox: gl.getParameter(gl.SCISSOR_BOX),

    blendEnabled: gl.isEnabled(gl.BLEND),
    blendSrcRGB: gl.getParameter(gl.BLEND_SRC_RGB),
    blendDstRGB: gl.getParameter(gl.BLEND_DST_RGB),
    blendSrcA: gl.getParameter(gl.BLEND_SRC_ALPHA),
    blendDstA: gl.getParameter(gl.BLEND_DST_ALPHA),
    blendEqRGB: gl.getParameter(gl.BLEND_EQUATION_RGB),
    blendEqA: gl.getParameter(gl.BLEND_EQUATION_ALPHA),
    blendColor: gl.getParameter(gl.BLEND_COLOR),

    activeTex: gl.getParameter(gl.ACTIVE_TEXTURE),
    tex2d: gl.getParameter(gl.TEXTURE_BINDING_2D),
  };
}

function restoreBgGlState(gl: WebGL2RenderingContext, s: BgGlState): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb);
  gl.useProgram(s.prog);
  gl.bindVertexArray(s.vao);

  gl.viewport(s.viewport[0], s.viewport[1], s.viewport[2], s.viewport[3]);

  if (s.scissorEnabled) gl.enable(gl.SCISSOR_TEST);
  else gl.disable(gl.SCISSOR_TEST);
  gl.scissor(s.scissorBox[0], s.scissorBox[1], s.scissorBox[2], s.scissorBox[3]);

  if (s.blendEnabled) gl.enable(gl.BLEND);
  else gl.disable(gl.BLEND);
  gl.blendColor(s.blendColor[0], s.blendColor[1], s.blendColor[2], s.blendColor[3]);
  gl.blendFuncSeparate(s.blendSrcRGB, s.blendDstRGB, s.blendSrcA, s.blendDstA);
  gl.blendEquationSeparate(s.blendEqRGB, s.blendEqA);

  gl.activeTexture(s.activeTex);
  gl.bindTexture(gl.TEXTURE_2D, s.tex2d);
}

function isObj(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Arrays: override wins, but we support "patch arrays" from UI (sparse/partial by index)
function mergeDeep(a: any, b: any): any {
  if (b === undefined) return a;

  // --- Arrays ---
  if (Array.isArray(a) && Array.isArray(b)) {
    const outLen = Math.max(a.length, b.length);

    // Heuristic: treat as patch if b shorter than a OR looks sparse/partial
    let patchMode = b.length < a.length;

    if (!patchMode) {
      const lim = Math.min(a.length, b.length);
      let defined = 0;
      for (let i = 0; i < lim; i++) {
        const has = Object.prototype.hasOwnProperty.call(b, i);
        const bv = (b as any)[i];
        if (has && bv !== undefined) defined++;
      }
      // if override doesn't define most base indices => it's a patch
      if (defined < lim) patchMode = true;
    }

    // Extra heuristic: base layer objects have kind/id but override slots are partial (often {params:{...}})
    if (!patchMode) {
      const lim2 = Math.min(a.length, b.length);
      for (let i = 0; i < lim2; i++) {
        const has = Object.prototype.hasOwnProperty.call(b, i);
        if (!has) continue;

        const av: any = (a as any)[i];
        const bv: any = (b as any)[i];
        if (!av || !bv || typeof av !== "object" || typeof bv !== "object") continue;

        const aHasKindOrId = av.kind !== undefined || av.id !== undefined;
        const bHasKindOrId = bv.kind !== undefined || bv.id !== undefined;

        const bKeys = Object.keys(bv);
        const bLooksLikeParamsOnly = bKeys.length === 1 && bKeys[0] === "params";

        if (aHasKindOrId && (!bHasKindOrId || bLooksLikeParamsOnly)) {
          patchMode = true;
          break;
        }
      }
    }

    if (patchMode) {
      const out: any[] = new Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const av = a[i];
        const has = Object.prototype.hasOwnProperty.call(b, i);
        const bv = has ? (b as any)[i] : undefined;
        out[i] = bv === undefined ? av : mergeDeep(av, bv);
      }
      return out;
    }

    // Full replace (supports reorder / delete patterns)
    return b;
  }

  // One side array => override wins
  if (Array.isArray(a) || Array.isArray(b)) return b;

  // --- Objects / primitives ---
  if (!isObj(a) || !isObj(b)) return b;

  const out: any = { ...a };
  for (const k of Object.keys(b)) out[k] = mergeDeep(a[k], b[k]);
  return out;
}

function getGlobalBgOverrides(): any {
  const g: any = globalThis as any;
  const cm = g.__CM ?? {};
  return cm.bgLabState && cm.bgLabState.overrides ? cm.bgLabState.overrides : {};
}

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
    const cur: any = preset;
    const curLayers: any[] = Array.isArray(cur?.layers) ? cur.layers : [];
    const curById = new Map(curLayers.map((l) => [String(l?.id), l]));

    for (const [layerId, ent] of this.renderers) {
      const l2 = curById.get(layerId);
      if (!l2) {
        try {
          ent.r.dispose();
        } catch {}
        this.renderers.delete(layerId);
        continue;
      }
      const nextKind = String(l2.kind ?? "");
      if (nextKind && ent.kind !== nextKind) {
        try {
          ent.r.dispose();
        } catch {}
        this.renderers.delete(layerId);
      }
    }

    this.snapshot = next;
  }

  draw(ctx: BgDrawCtx): void {
    if (!this.snapshot || !this.gl) return;

    const gl = this.gl;
    const saved = captureBgGlState(gl);

    try {
      const ov = getGlobalBgOverrides();
      const preset: any = mergeDeep(this.snapshot.preset ?? {}, ov);

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

      // pipeline-managed blend (overridden per-layer)
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

        // params expected by renderers
        const params = {
          common,
          quality,
          shader: layer?.params?.shader ?? {},
          flow: layer?.params?.flow ?? {},
        };

        ent.r.setUniforms(params, (ctx as any).time, effScroll, null);
        ent.r.draw();

        // Some BG renderers may touch BLEND state internally -> re-assert layer blend for next layer
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
    } finally {
      // Restore exactly what the caller had (SceneRT binding + viewport + blend etc.)
      restoreBgGlState(gl, saved);
    }
  }

  dispose(): void {
    for (const ent of this.renderers.values()) {
      try {
        ent.r.dispose();
      } catch {}
    }
    this.renderers.clear();
  }
}