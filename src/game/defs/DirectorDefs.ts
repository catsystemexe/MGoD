// src/game/defs/DirectorDefs.ts
import { CONTENT } from "../content/CONTENT";
import type { DirectorDefs } from "./DirectorTypes";

export const DIRECTOR_DEFS_MVP: DirectorDefs = {
  globalMaxAlive: 24,
  waves: CONTENT.waves.map(w => ({
    id: w.id,
    trigger: {
      kind: "time",
      startSec: w.startSec,
      endSec: w.startSec + w.durationSec,
    },
    spawnEverySec: w.spawnEverySec,
    maxAlive: w.maxAlive,
    enemyTypeId: w.enemyTypeId,
    pattern: {
      kind: "grid",
      cols: 10,
      rows: 4,
      spacingX: 24,
      spacingY: 18,
      originX: 40,
      originY: 30,
    },
    behaviorPresetId: "invaders.basic",
  })),
};
