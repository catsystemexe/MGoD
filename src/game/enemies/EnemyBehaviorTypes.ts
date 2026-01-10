// src/game/enemies/EnemyBehaviorTypes.ts

import type { TickContext } from "../../engine/core/Loop";

export type EnemyBehaviorId = 
  "none" |
  "straight" |
  "sine" |
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
  update?: (e: any, ctx: TickContext) => void;
};
