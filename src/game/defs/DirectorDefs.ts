// src/game/defs/DirectorDefs.ts
import { CONTENT } from "../content/CONTENT";
import type { DirectorDefs } from "./DirectorTypes";

// DEV: allow forcing single wave by id (set in console: window.__CM_DEV_SOLO_WAVE__="wave.red")
function pickWaves() {
  const solo =
    typeof window !== "undefined"
      ? (window as any).__CM_DEV_SOLO_WAVE__
      : undefined;

  if (typeof solo === "string" && solo.length > 0) {
    return CONTENT.waves.filter((w) => w.id === solo);
  }
  return CONTENT.waves;
}

export const DIRECTOR_DEFS_MVP: DirectorDefs = {
  // globalMaxAlive: 999,
  waves: pickWaves().map((w) => ({
    id: w.id,
    trigger: {
      kind: "time",
      startSec: w.startSec,
      endSec: w.startSec + w.durationSec,
    },
    spawnEverySec: w.spawnEverySec,
    maxAlive: w.maxAlive,
    enemyTypeId: w.enemyTypeId,

    // take from content (directorWaves.json)
    pattern: w.pattern,
    behaviorPresetId: w.behaviorPresetId,
  })),
};