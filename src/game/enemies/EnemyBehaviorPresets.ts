// src/game/enemies/EnemyBehaviorPresets.ts
import type { EnemyBehaviorId, EnemyBehaviorParams } from "./EnemyBehaviorTypes";

export type EnemyBehaviorPresetId =
  | "none"
  | "straight.basic"
  | "sine.basic";

export type EnemyBehaviorPreset = {
  behaviorId: EnemyBehaviorId;
  params: EnemyBehaviorParams;
};

export const EnemyBehaviorPresets: Record<EnemyBehaviorPresetId, EnemyBehaviorPreset> = {
  none: {
    behaviorId: "none",
    params: {},
  },

  "straight.basic": {
    behaviorId: "straight",
    // params jsou volitelné; straight může klidně jet jen na defaultních hodnotách
    params: { speed: 40 },
  },

  "sine.basic": {
    behaviorId: "sine",
    params: {
      speed: 30,     // base fall speed
      amp: 24,       // amplitude
      freq: 1.25,    // Hz-ish (záleží na implementaci)
    },
  },
};
