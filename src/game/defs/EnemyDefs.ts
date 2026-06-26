// src/game/defs/EnemyDefs.ts
import { CONTENT } from "../content/CONTENT";
import attackProfilesJson from "../content/attackProfiles.json";
import type { AttackProfileDef } from "../enemies/AttackController";
import type {
  EnemyAppearanceDef,
  EnemyGlyphRenderDef,
  EnemyProcRenderDef,
  EnemySdfRenderDef,
  EnemySdfShape,
  EnemySpriteRenderDef,
} from "./EnemyAppearanceTypes";

export type EnemyTypeId = string;

// Must match SHAPE_ID keys in src/render/webgl/SdfPass.ts
const SDF_SHAPES: ReadonlySet<string> = new Set([
  "arrow", "orb", "crown", "mandala", "sigil",
  "bolt", "triangle", "chevron", "thruster", "laser",
]);

export interface EnemyDef {
  hp: number;
  radius: number;
  scoreOnKill: number;
  behaviorPreset: string; // content-driven (string); runtime resolves preset map
  render?: EnemyAppearanceDef; // OPTIONAL

  // OPTIONAL AI overlay (future-ready; no runtime effect unless EnemySystem uses it)
  ai?: Record<string, unknown>;
  aiWeight?: number; // 0..1 initial blend
  aiEaseSec?: number; // smoothing time constant (sec)

  attackProfile?: AttackProfileDef;
}

const ATTACK_PROFILES: Record<string, AttackProfileDef> = attackProfilesJson as any;

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

export function normalizeEnemySpriteRender(
  renderSpriteRaw: unknown,
  enemyTypeId: string,
): EnemySpriteRenderDef | undefined {
  let spriteId: string | undefined;
  let scale = 1.0;

  if (isObj(renderSpriteRaw)) {
    const rawId = (renderSpriteRaw as any).id;
    if (typeof rawId === "string" && rawId.trim().length > 0) {
      spriteId = rawId.trim();
    } else if (rawId !== undefined) {
      console.warn("[EnemyDefs] Invalid render.sprite.id for", enemyTypeId, "value:", rawId);
    }

    const rawScale = (renderSpriteRaw as any).scale;
    if (rawScale !== undefined) {
      if (typeof rawScale === "number" && Number.isFinite(rawScale) && rawScale > 0) {
        scale = rawScale;
      } else {
        console.warn("[EnemyDefs] Invalid render.sprite.scale for", enemyTypeId, "value:", rawScale, "using 1.0");
      }
    }
  } else if (renderSpriteRaw !== undefined) {
    console.warn("[EnemyDefs] Invalid render.sprite for", enemyTypeId, "value:", renderSpriteRaw);
  }

  return spriteId ? { id: spriteId, scale } : undefined;
}

export function buildEnemyAppearanceRaw(t: unknown): Record<string, unknown> {
  const enemyRaw = isObj(t) ? t : {};
  const renderRaw = isObj(enemyRaw.render) ? enemyRaw.render : {};

  return {
    ...renderRaw,
    ...(renderRaw.color === undefined
      ? { color: enemyRaw.renderColor ?? enemyRaw.color }
      : {}),
    ...(renderRaw.glyphId === undefined && enemyRaw.glyphId !== undefined
      ? { glyphId: enemyRaw.glyphId }
      : {}),
    ...(renderRaw.glyphs === undefined && enemyRaw.glyphs !== undefined
      ? { glyphs: enemyRaw.glyphs }
      : {}),
    ...(renderRaw.proc === undefined && enemyRaw.proc !== undefined
      ? { proc: enemyRaw.proc }
      : {}),
    ...(renderRaw.sdf === undefined && enemyRaw.sdf !== undefined
      ? { sdf: enemyRaw.sdf }
      : {}),
  };
}

export function normalizeEnemyAppearance(
  raw: unknown,
  enemyTypeId: string,
): EnemyAppearanceDef | undefined {
  const renderRaw = isObj(raw) ? raw : undefined;

  const colorRaw = renderRaw?.color;
  const glyphIdRaw = renderRaw?.glyphId;
  const glyphsRaw = renderRaw?.glyphs;
  const procRaw = renderRaw?.proc;
  const sdfRaw = renderRaw?.sdf;
  const spriteRaw = renderRaw?.sprite;

  const color = strOrUndef(colorRaw);
  const glyphId = strOrUndef(glyphIdRaw);
  const sprite = normalizeEnemySpriteRender(spriteRaw, enemyTypeId);

  let glyphs: EnemyGlyphRenderDef[] | undefined;
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

          const it: EnemyGlyphRenderDef = { id: gid, dx, dy };
          if (col) it.color = col;
          if (alpha !== undefined) it.alpha = alpha;
          if (pulseHz !== undefined) it.pulseHz = pulseHz;
          if (pulseAmp !== undefined) it.pulseAmp = pulseAmp;
          return it;
        })
        .filter((x: any) => !!x) as EnemyGlyphRenderDef[];

      glyphs = parsed.length ? parsed : undefined;
    } else {
      glyphs = undefined;
    }
  }

  let proc: EnemyProcRenderDef | undefined;
  if (procRaw !== undefined) {
    if (isObj(procRaw) && (procRaw as any).kind === "parts" && Array.isArray((procRaw as any).parts)) {
      proc = {
        kind: "parts",
        parts: (procRaw as any).parts
          .filter((x: any) => isObj(x))
          .map((x: any) => ({
            dx: numOr(x.dx, 0),
            dy: numOr(x.dy, 0),
            w: numOr(x.w, 0),
            h: numOr(x.h, 0),
            ...(strOrUndef(x.color) ? { color: strOrUndef(x.color) } : {}),
            ...(typeof x.alpha === "number" && Number.isFinite(x.alpha) ? { alpha: clamp01(x.alpha) } : {}),
            ...(typeof x.pulseHz === "number" && Number.isFinite(x.pulseHz) ? { pulseHz: x.pulseHz } : {}),
            ...(typeof x.pulseAmp === "number" && Number.isFinite(x.pulseAmp) ? { pulseAmp: clamp01(x.pulseAmp) } : {}),
          })),
      };
    } else {
      proc = undefined;
    }
  }

  let sdf: EnemySdfRenderDef | undefined;
  if (sdfRaw !== undefined) {
    const shapeRaw = isObj(sdfRaw) ? String((sdfRaw as any).shape ?? "") : "";
    if (isObj(sdfRaw) && SDF_SHAPES.has(shapeRaw)) {
      const scol = strOrUndef((sdfRaw as any).color);
      const ssize =
        typeof (sdfRaw as any).size === "number" && Number.isFinite((sdfRaw as any).size)
          ? (sdfRaw as any).size
          : undefined;
      sdf = {
        shape: shapeRaw as EnemySdfShape,
        ...(scol ? { color: scol } : {}),
        ...(ssize !== undefined ? { size: ssize } : {}),
      };
    } else {
      console.warn("[EnemyDefs] Invalid sdf (shape must be one of arrow/orb/crown/mandala/sigil/bolt/triangle/chevron/thruster/laser) for", enemyTypeId, "value:", sdfRaw);
    }
  }

  if (colorRaw !== undefined && color === undefined) {
    console.warn("[EnemyDefs] Invalid render color for", enemyTypeId, "value:", colorRaw);
  }

  if (glyphIdRaw !== undefined && glyphId === undefined) {
    console.warn("[EnemyDefs] Invalid glyphId for", enemyTypeId, "value:", glyphIdRaw);
  }

  if (glyphsRaw !== undefined && !Array.isArray(glyphsRaw)) {
    console.warn("[EnemyDefs] Invalid glyphs (expected array) for", enemyTypeId, "value:", glyphsRaw);
  }

  if (procRaw !== undefined && proc === undefined) {
    console.warn("[EnemyDefs] Invalid proc (expected {kind:'parts',parts:[]}) for", enemyTypeId, "value:", procRaw);
  }

  const hasUsableAppearancePath = !!(sprite || glyphId || glyphs || proc || sdf);

  return {
    ...(color ? { color } : {}),
    ...(sprite ? { sprite } : {}),
    ...(sdf ? { sdf } : {}),
    ...(glyphId ? { glyphId } : {}),
    ...(glyphs ? { glyphs } : {}),
    ...(proc ? { proc } : {}),
    ...(!hasUsableAppearancePath ? { glyphId: `enemy.${enemyTypeId}` } : {}),
  };
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

    const appearance = normalizeEnemyAppearance(buildEnemyAppearanceRaw(t), id);

    const hp = numOr(hpRaw, 1);
    const radius = numOr(radiusRaw, 4);
    const scoreOnKill = numOr(scoreRaw, 0);
    const behaviorPreset = typeof presetRaw === "string" && presetRaw.length ? presetRaw : "none.basic";

    // ai overlay (optional)
    const aiRaw = t?.ai;
    const aiWeightRaw = t?.aiWeight;
    const aiEaseSecRaw = t?.aiEaseSec;

    // attack profile (optional)
    const attackProfileIdRaw = t?.attackProfileId;

    const ai = isObj(aiRaw) ? (aiRaw as Record<string, unknown>) : undefined;
    const aiWeight = typeof aiWeightRaw === "number" && Number.isFinite(aiWeightRaw) ? aiWeightRaw : undefined;
    const aiEaseSec = typeof aiEaseSecRaw === "number" && Number.isFinite(aiEaseSecRaw) ? aiEaseSecRaw : undefined;

    let attackProfile: AttackProfileDef | undefined;
    if (typeof attackProfileIdRaw === "string" && attackProfileIdRaw.length) {
      const ap = ATTACK_PROFILES[attackProfileIdRaw];
      if (ap) {
        attackProfile = ap;
      } else {
        console.warn("[EnemyDefs] Unknown attackProfileId for", id, "value:", attackProfileIdRaw);
      }
    }

    if (hpRaw === undefined || radiusRaw === undefined || scoreRaw === undefined || presetRaw === undefined) {
      console.warn("[EnemyDefs] Using defaults for", id, {
        hp,
        radius,
        scoreOnKill,
        behaviorPreset,
        raw: { hpRaw, radiusRaw, scoreRaw, presetRaw },
      });
    }

    out[id] = {
      hp,
      radius,
      scoreOnKill,
      behaviorPreset,
      ...(appearance ? { render: appearance } : {}),
      ...(ai ? { ai } : {}),
      ...(aiWeight !== undefined ? { aiWeight } : {}),
      ...(aiEaseSec !== undefined ? { aiEaseSec } : {}),
      ...(attackProfile ? { attackProfile } : {}),
    };
  }

  return out;
})();
