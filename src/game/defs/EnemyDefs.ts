// src/game/defs/EnemyDefs.ts
import { CONTENT } from "../content/CONTENT";

export type EnemyTypeId = string;

export interface EnemyRenderDef {
  // OPTIONAL: base color (fallback)
  color?: string; // CSS color, typicky "#rrggbb"

  // OPTIONAL: pixel-glyph id (render/glyphs)
  glyphId?: string;

  // OPTIONAL: stacked glyphs (composite entity)
  glyphs?: Array<{
    id: string; // glyph id in GlyphDB
    dx?: number; // offset from entity center
    dy?: number;
    color?: string; // overrides base color
    alpha?: number; // 0..1
    pulseHz?: number; // if set => sin pulse alpha
    pulseAmp?: number; // 0..1
  }>;

  // OPTIONAL: procedural vector parts (rendered as quads)
  proc?: {
    kind: "parts";
    parts: Array<{
      dx: number; // offset from entity center
      dy: number;
      w: number;
      h: number;
      color?: string; // overrides base color
      alpha?: number; // 0..1
      pulseHz?: number; // if set => sin pulse alpha
      pulseAmp?: number; // 0..1
    }>;
  };
}

export interface EnemyDef {
  hp: number;
  radius: number;
  scoreOnKill: number;
  behaviorPreset: string; // content-driven (string); runtime resolves preset map
  render?: EnemyRenderDef; // OPTIONAL

  // OPTIONAL AI overlay (future-ready; no runtime effect unless EnemySystem uses it)
  ai?: Record<string, unknown>;
  aiWeight?: number; // 0..1 initial blend
  aiEaseSec?: number; // smoothing time constant (sec)
}

type GlyphStackItem = {
  id: string;
  dx?: number;
  dy?: number;
  color?: string;
  alpha?: number;
  pulseHz?: number;
  pulseAmp?: number;
};

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}

function numOr(x: unknown, fallback: number): number {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

function strOrUndef(x: unknown): string | undefined {
  return typeof x === "string" && x.length ? x : undefined;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 1;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * ENEMY_DEFS se generuje z contentu, aby nemohly vzniknout 2 světy ID.
 * Single source of truth = src/game/content/enemyTypes.json (přes loadContent()).
 *
 * DŮLEŽITÉ: parser je tolerantní -> pokud content nemá některé fieldy, použije defaulty
 * a zaloguje warning místo crash.
 */
export const ENEMY_DEFS: Record<EnemyTypeId, EnemyDef> = (() => {
  const out: Record<string, EnemyDef> = {};
  const list: any[] = (CONTENT as any)?.enemyTypes ?? [];

  if (!Array.isArray(list)) {
    console.error("[EnemyDefs] CONTENT.enemyTypes is not an array:", (CONTENT as any)?.enemyTypes);
    return out;
  }

  for (const t of list) {
    const id = String(t?.id ?? "");
    if (!id) {
      console.warn("[EnemyDefs] enemyTypes item missing id:", t);
      continue;
    }

    // tolerate common naming variants
    const hpRaw = t.hp ?? t.health ?? t.hitpoints;
    const radiusRaw = t.radius ?? t.r;
    const scoreRaw = t.scoreOnKill ?? t.score ?? t.points;

    const presetRaw =
      t.behaviorPresetId ?? // ✅ content JSON (aktuální)
      t.behaviorPresetID ?? // (tolerance na variantu)
      t.behaviorPreset ?? // starší varianta
      t.preset ??
      t.behavior ??
      "none.basic"; // ✅ tvoje content preset ID pro none

    // render.color tolerance:
    // - preferred: t.render.color
    // - alternates: t.color, t.renderColor
    const colorRaw = t?.render?.color ?? t?.renderColor ?? t?.color;

    const glyphIdRaw = t?.render?.glyphId ?? t?.glyphId;
    const glyphsRaw = t?.render?.glyphs ?? t?.glyphs;

    const procRaw = t?.render?.proc ?? t?.proc;

    // ai overlay (optional)
    const aiRaw = t?.ai;
    const aiWeightRaw = t?.aiWeight;
    const aiEaseSecRaw = t?.aiEaseSec;

    const hp = numOr(hpRaw, 1);
    const radius = numOr(radiusRaw, 4);
    const scoreOnKill = numOr(scoreRaw, 0);
    const behaviorPreset = typeof presetRaw === "string" && presetRaw.length ? presetRaw : "none.basic";

    const color = strOrUndef(colorRaw);
    const glyphId = strOrUndef(glyphIdRaw);

    // glyph stack: tolerant parser, but ensures id is non-empty and numbers are sane
    let glyphs: GlyphStackItem[] | undefined;
    if (glyphsRaw !== undefined) {
      if (Array.isArray(glyphsRaw)) {
        const parsed = glyphsRaw
          .filter((x: any) => isObj(x))
          .map((x: any) => {
            const gid = String(x.id ?? "");
            if (!gid) return null;

            const dx = numOr(x.dx, 0);
            const dy = numOr(x.dy, 0);

            const col = strOrUndef(x.color);
            const alpha =
              typeof x.alpha === "number" && Number.isFinite(x.alpha) ? clamp01(x.alpha) : undefined;

            const pulseHz =
              typeof x.pulseHz === "number" && Number.isFinite(x.pulseHz) ? x.pulseHz : undefined;

            const pulseAmp =
              typeof x.pulseAmp === "number" && Number.isFinite(x.pulseAmp) ? clamp01(x.pulseAmp) : undefined;

            const it: GlyphStackItem = { id: gid, dx, dy };
            if (col) it.color = col;
            if (alpha !== undefined) it.alpha = alpha;
            if (pulseHz !== undefined) it.pulseHz = pulseHz;
            if (pulseAmp !== undefined) it.pulseAmp = pulseAmp;
            return it;
          })
          .filter((x: any) => !!x) as GlyphStackItem[];

        glyphs = parsed.length ? parsed : undefined;
      } else {
        // present but wrong type
        glyphs = undefined;
      }
    }

    // proc: accept only { kind:"parts", parts:Array }
    let proc: EnemyRenderDef["proc"] | undefined;
    if (procRaw !== undefined) {
      if (isObj(procRaw) && (procRaw as any).kind === "parts" && Array.isArray((procRaw as any).parts)) {
        proc = procRaw as any;
      } else {
        proc = undefined;
      }
    }

    const ai = isObj(aiRaw) ? (aiRaw as Record<string, unknown>) : undefined;
    const aiWeight = typeof aiWeightRaw === "number" && Number.isFinite(aiWeightRaw) ? aiWeightRaw : undefined;
    const aiEaseSec = typeof aiEaseSecRaw === "number" && Number.isFinite(aiEaseSecRaw) ? aiEaseSecRaw : undefined;

    if (hpRaw === undefined || radiusRaw === undefined || scoreRaw === undefined || presetRaw === undefined) {
      console.warn("[EnemyDefs] Using defaults for", id, {
        hp,
        radius,
        scoreOnKill,
        behaviorPreset,
        raw: { hpRaw, radiusRaw, scoreRaw, presetRaw },
      });
    }

    if (colorRaw !== undefined && color === undefined) {
      console.warn("[EnemyDefs] Invalid render color for", id, "value:", colorRaw);
    }

    if (glyphIdRaw !== undefined && glyphId === undefined) {
      console.warn("[EnemyDefs] Invalid glyphId for", id, "value:", glyphIdRaw);
    }

    if (glyphsRaw !== undefined && !Array.isArray(glyphsRaw)) {
      console.warn("[EnemyDefs] Invalid glyphs (expected array) for", id, "value:", glyphsRaw);
    }

    if (procRaw !== undefined && proc === undefined) {
      console.warn("[EnemyDefs] Invalid proc (expected {kind:'parts',parts:[]}) for", id, "value:", procRaw);
    }

    const hasRender = !!(color || glyphId || glyphs || proc);

    out[id] = {
      hp,
      radius,
      scoreOnKill,
      behaviorPreset,
      ...(hasRender
        ? {
            render: {
              ...(color ? { color } : {}),
              ...(glyphId ? { glyphId } : {}),
              ...(glyphs ? { glyphs } : {}),
              ...(proc ? { proc } : {}),
            },
          }
        : {}),
      ...(ai ? { ai } : {}),
      ...(aiWeight !== undefined ? { aiWeight } : {}),
      ...(aiEaseSec !== undefined ? { aiEaseSec } : {}),
    };
  }

  return out;
})();