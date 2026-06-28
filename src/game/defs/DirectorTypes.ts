// src/game/defs/DirectorTypes.ts
export type WaveId = string;
export type EnemyTypeId = string;

export type WaveTrigger =
  | { kind: "time"; startSec: number; endSec?: number }
  | { kind: "manual" };

export type WaveDef = {
  id: WaveId;
  trigger: WaveTrigger;

  spawnEverySec: number;
  maxAlive: number;      // per-wave cap
  enemyTypeId: EnemyTypeId;

  pattern?: {
    kind: "grid";
    cols: number;
    rows: number;
    spacingX: number;
    spacingY: number;
    originX: number;
    originY: number;
  };

  behaviorPresetId?: string; // optional override (e.g. "invaders.pack")

  // future knobs (optional)
  weight?: number;
  cost?: number;
};

export type DirectorDefs = {
  waves: WaveDef[];
  globalMaxAlive?: number; // global cap (optional)
};
