// src/game/enemies/EnemyBehaviorTypes.ts



/**
 * Behavior V1 CONTRACT
 * --------------------
 * - Behavior NESMÍ zapisovat e.pos / e.vel
 * - update() = pouze stav (bState, čas, fáze)
 * - getTarget() = analytický cíl, pohyb řeší EnemySystem
 */



import type { TickContext } from "../../engine/core/Loop";

export type EnemyBehaviorId =
  "none" |
  "straight" |
  "sine" |
  "invaders" |
  "orbit" |
  "zigzag";

// Parametry jsou “data first” – validaci děláme runtime guardem.
export type EnemyBehaviorParams = Record<string, any>;

export interface EnemyBehaviorRuntime {
  t: number; // accumulated time
  // prostor pro seed/phase/random offset atd.
  [k: string]: any;
}

export type EnemyBehavior = {
  init?: (e: any) => void;

  // update = state update (t, phase, etc.)
  update?: (e: any, ctx: TickContext) => void;

  // optional V1 contract: behavior provides analytic target, system derives vel
  getTarget?: (e: any, ctx: TickContext) => { x: number; y: number } | null;
};

// ---- Content (data-first) types used by loadContent()

export type BehaviorPreset = {
  id: string;                 // e.g. "straight.basic"
  behaviorId: EnemyBehaviorId; // e.g. "straight"
  params: EnemyBehaviorParams; // runtime-validated
};

export type EnemyTypeDef = {
  id: string;                 // e.g. "red"
  hp: number;
  radius: number;
  scoreOnKill: number;
  behaviorPresetId: string;   // default preset for this type (can be overridden by wave)

  // Optional render extras used by EnemyDefs; loadContent validates the shape when present.
  spriteId?: string; // legacy compatibility alias during render.sprite migration
  render?: {
    sprite?: {
      id: string;
      scale?: number;
    };
    [k: string]: unknown;
  };
};

// wave def as loaded from directorWaves.json
export type WaveDef = {
  id: string;
  startSec: number;
  durationSec: number;
  spawnEverySec: number;
  maxAlive: number;
  enemyTypeId: string;

  // optional extras used by DirectorSystem
  behaviorPresetId?: string;
  pattern?: any;
};

export type ContentBundle = {
  enemyTypes: EnemyTypeDef[];
  behaviorPresets: BehaviorPreset[];
  waves: WaveDef[];
};
// ---- Runtime guard (single source of truth)
export const ENEMY_BEHAVIOR_IDS = [
  "none",
  "straight",
  "sine",
  "invaders",
  "zigzag",
   "orbit" 
] as const;

export function isEnemyBehaviorId(x: unknown): x is EnemyBehaviorId {
  return typeof x === "string" && (ENEMY_BEHAVIOR_IDS as readonly string[]).includes(x);
}