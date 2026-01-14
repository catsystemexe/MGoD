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