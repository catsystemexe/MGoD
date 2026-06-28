// src/game/enemies/EnemyBehaviorPresets.ts
// src/game/enemies/EnemyBehaviorPresets.ts
import { CONTENT } from "../content/CONTENT";
import { isEnemyBehaviorId } from "./EnemyBehaviorTypes";
import type { EnemyBehaviorId, EnemyBehaviorParams } from "./EnemyBehaviorTypes";
export type EnemyBehaviorPresetId = string;

export type EnemyBehaviorPreset = {
  id: EnemyBehaviorPresetId;
  behaviorId: EnemyBehaviorId;
  params: EnemyBehaviorParams;
};

function isObj(x: unknown): x is Record<string, any> {
  return !!x && typeof x === "object";
}

function isStr(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}

/**
 * Single source of truth:
 *  - src/game/content/behaviorPresets.json (přes CONTENT.behaviorPresets)
 */
export const EnemyBehaviorPresets: Record<EnemyBehaviorPresetId, EnemyBehaviorPreset> = (() => {
  const out: Record<string, EnemyBehaviorPreset> = {};

  const list: any[] = (CONTENT as any)?.behaviorPresets ?? [];
  if (!Array.isArray(list)) {
    console.error("[EnemyBehaviorPresets] CONTENT.behaviorPresets is not an array:", (CONTENT as any)?.behaviorPresets);
    // hard fallback
    out["none.hold"] = { id: "none.hold", behaviorId: "none", params: {} };
    return out;
  }

  for (const raw of list) {
    const id = isStr(raw?.id) ? raw.id : "";
    if (!id) {
      console.warn("[EnemyBehaviorPresets] preset missing id:", raw);
      continue;
    }

    const behaviorIdRaw = raw?.behaviorId;
    const behaviorId: EnemyBehaviorId = isEnemyBehaviorId(behaviorIdRaw) ? behaviorIdRaw : "none";
    const params = isObj(raw?.params) ? raw.params : {};

    out[id] = { id, behaviorId, params };
  }

  // ensure required default exists
  if (!out["none.hold"]) {
    out["none.hold"] = { id: "none.hold", behaviorId: "none", params: {} };
  }

  console.log("[EnemyBehaviorPresets] loaded:", Object.keys(out));

  return out;
})();
