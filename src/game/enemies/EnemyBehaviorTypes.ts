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
  "zigzag" |
  "loop" |
  "invaders";

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

// ---- Behavior preset content type used by loadContent()

export type BehaviorPreset = {
  id: string;                 // e.g. "straight.basic"
  behaviorId: EnemyBehaviorId; // e.g. "straight"
  params: EnemyBehaviorParams; // runtime-validated
};

// ---- Runtime guard (single source of truth)
export const ENEMY_BEHAVIOR_IDS = [
  "none",
  "straight",
  "sine",
  "zigzag",
  "loop",
  "invaders",
] as const;

export function isEnemyBehaviorId(x: unknown): x is EnemyBehaviorId {
  return typeof x === "string" && (ENEMY_BEHAVIOR_IDS as readonly string[]).includes(x);
}