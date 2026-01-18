// src/game/defs/EnemyDefs.ts
import { CONTENT } from "../content/CONTENT";

export type EnemyTypeId = string;

export interface EnemyRenderDef {
  color: string; // CSS color, typicky "#rrggbb"
}

export interface EnemyDef {
  hp: number;
  radius: number;
  scoreOnKill: number;
  behaviorPreset: string;     // content-driven (string); runtime resolves preset map
  render?: EnemyRenderDef;    // OPTIONAL

  // OPTIONAL AI overlay (future-ready; no runtime effect unless EnemySystem uses it)
  ai?: Record<string, unknown>;
  aiWeight?: number;          // 0..1 initial blend
  aiEaseSec?: number;         // smoothing time constant (sec)
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
      t.behaviorPresetId ??           // ✅ content JSON (aktuální)
      t.behaviorPresetID ??           // (tolerance na variantu)
      t.behaviorPreset ??             // starší varianta
      t.preset ??
      t.behavior ??
      "none.basic";                   // ✅ tvoje content preset ID pro none

    // render.color tolerance:
    // - preferred: t.render.color
    // - alternates: t.color, t.renderColor
    const colorRaw =
      t?.render?.color ??
      t?.renderColor ??
      t?.color;

    // ai overlay (optional)
    const aiRaw = t?.ai;
    const aiWeightRaw = t?.aiWeight;
    const aiEaseSecRaw = t?.aiEaseSec;

    const hp = (typeof hpRaw === "number" && Number.isFinite(hpRaw)) ? hpRaw : 1;
    const radius = (typeof radiusRaw === "number" && Number.isFinite(radiusRaw)) ? radiusRaw : 4;
    const scoreOnKill = (typeof scoreRaw === "number" && Number.isFinite(scoreRaw)) ? scoreRaw : 0;
    const behaviorPreset = (typeof presetRaw === "string" && presetRaw.length) ? presetRaw : "none.basic";

    const color =
      (typeof colorRaw === "string" && colorRaw.length)
        ? colorRaw
        : undefined;

    const ai = (aiRaw && typeof aiRaw === "object") ? (aiRaw as Record<string, unknown>) : undefined;
    const aiWeight = (typeof aiWeightRaw === "number" && Number.isFinite(aiWeightRaw)) ? aiWeightRaw : undefined;
    const aiEaseSec = (typeof aiEaseSecRaw === "number" && Number.isFinite(aiEaseSecRaw)) ? aiEaseSecRaw : undefined;

    if (hpRaw === undefined || radiusRaw === undefined || scoreRaw === undefined || presetRaw === undefined) {
      console.warn("[EnemyDefs] Using defaults for", id, {
        hp, radius, scoreOnKill, behaviorPreset,
        raw: { hpRaw, radiusRaw, scoreRaw, presetRaw }
      });
    }

    if (colorRaw !== undefined && color === undefined) {
      console.warn("[EnemyDefs] Invalid render color for", id, "value:", colorRaw);
    }

    out[id] = {
      hp,
      radius,
      scoreOnKill,
      behaviorPreset,
      ...(color ? { render: { color } } : {}),
      ...(ai ? { ai } : {}),
      ...(aiWeight !== undefined ? { aiWeight } : {}),
      ...(aiEaseSec !== undefined ? { aiEaseSec } : {}),
    };
  }

  return out;
})();
