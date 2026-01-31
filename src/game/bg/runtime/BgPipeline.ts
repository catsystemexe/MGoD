
import { BgPreset } from "../schema/BgPreset";
import { BgSnapshot } from "./BgSnapshot";
import { BgDrawCtx } from "./BgDrawCtx";
import { BaseRenderer } from "./base/BaseRenderer";
import { createRenderer } from "./base/createRenderer";

function isObj(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Arrays: override wins (layers reorder / replace must work)
function mergeDeep(a: any, b: any): any {
  if (b === undefined) return a;

  // --- Arrays ---
  if (Array.isArray(a) && Array.isArray(b)) {
    // If override array looks like a partial patch (typical for setByPath layers.0....),
    // merge by index so we don't destroy base layers.
    const outLen = Math.max(a.length, b.length);
    const out: any[] = new Array(outLen);

    // Heuristic: treat as patch if b is shorter than a OR looks sparse/partial
    let patchMode = b.length < a.length;

    // IMPORTANT: UI overrides often create sparse arrays like:
    //   [ , , {params:{...}} ]  or  [undefined, undefined, {...}]
    // If we "full replace", we destroy base layers and BG disappears.

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

    

      // Extra heuristic: if base layers contain full layer objects (kind/id),
      // but override slots look like partial patches (typically {params:{...}}),
      // treat as patch even when lengths match (common when base has exactly 1 layer).
      if (!patchMode) {
        const lim2 = Math.min(a.length, b.length);
        for (let i = 0; i < lim2; i++) {
          const has = Object.prototype.hasOwnProperty.call(b, i);
          if (!has) continue;
          const av: any = (a as any)[i];
          const bv: any = (b as any)[i];
          if (!av || !bv || typeof av !== "object" || typeof bv !== "object") continue;

          const aHasKindOrId = (av.kind !== undefined) || (av.id !== undefined);
          const bHasKindOrId = (bv.kind !== undefined) || (bv.id !== undefined);

          // classic UI patch: only params (or missing kind/id)
          const bKeys = Object.keys(bv);
          const bLooksLikeParamsOnly = (bKeys.length === 1 && bKeys[0] === "params");

          if (aHasKindOrId && (!bHasKindOrId || bLooksLikeParamsOnly)) {
            patchMode = true;
            break;
          }
        }
      }
if (patchMode) {
      for (let i = 0; i < outLen; i++) {
        const av = a[i];
        // treat holes and explicit undefined as "no override"
        const has = Object.prototype.hasOwnProperty.call(b, i);
        const bv = has ? (b as any)[i] : undefined;
        out[i] = (bv === undefined) ? av : mergeDeep(av, bv);
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
  return (cm.bgLabState && cm.bgLabState.overrides) ? cm.bgLabState.overrides : {};
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



  draw(ctx: BgDrawCtx): void {
    if (!this.snapshot || !this.gl) return;

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