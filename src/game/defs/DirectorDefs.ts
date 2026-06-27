// src/game/defs/DirectorDefs.ts
import { CONTENT } from "../content/CONTENT";
import type { DirectorDefs } from "./DirectorTypes";

// DEV: allow forcing single wave by id (set in console: window.__CM_DEV_SOLO_WAVE__="wave.red")
function pickWaves() {
  const solo =
    typeof window !== "undefined"
      ? (window as any).__CM_DEV_SOLO_WAVE__
      : undefined;

  const isDev =
    typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env.DEV;

  if (isDev && typeof solo === "string" && solo.length > 0) {
    const filtered = CONTENT.waves.filter((w) => w.id === solo);
    console.log("[DIR][SOLO] __CM_DEV_SOLO_WAVE__=", solo, "waves=", filtered.map((w) => w.id));
    return filtered;
  }

  if (typeof solo === "string" && solo.length > 0) {
    // someone set it in prod — ignore it, but warn
    console.warn("[DIR][SOLO] Ignored __CM_DEV_SOLO_WAVE__ outside DEV:", solo);
  }

  return CONTENT.waves;
}

export const DIRECTOR_DEFS_MVP: DirectorDefs = {
  globalMaxAlive: 50,
  waves: pickWaves().map((w) => {
    const isTest = w.id === "wave.test";

    return {
      id: w.id,

      // VŠECHNY waves mají time trigger
      trigger: {
        kind: "time",
        startSec: w.startSec,
        endSec: w.startSec + w.durationSec,
      },

      // ale jen test wave je defaultně enabled
      enabled: !isTest,

      spawnEverySec: w.spawnEverySec,
      maxAlive: w.maxAlive,
      enemyTypeId: w.enemyTypeId,
      pattern: w.pattern,
      behaviorPresetId: w.behaviorPresetId,
    };
  }),
};