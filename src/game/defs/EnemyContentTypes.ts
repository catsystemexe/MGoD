import type { BehaviorPreset } from "../enemies/EnemyBehaviorTypes";
import type { BehaviorGraph } from "../enemies/fsm";
import type { EnemyAppearanceDef } from "./EnemyAppearanceTypes";

export interface EnemyTypeContentDef {
  id: string;
  hp: number;
  radius: number;
  scoreOnKill: number;
  behaviorPresetId: string;
  behaviorGraphId?: string;
  attackProfileId?: string;
  render?: EnemyAppearanceDef;
  ai?: Record<string, unknown>;
  aiWeight?: number;
  aiEaseSec?: number;
}

export interface EnemyBehaviorBinding {
  presetId: string;
  ai?: Record<string, unknown>;
  aiWeight?: number;
  aiEaseSec?: number;
}

export interface EnemyAttackBinding {
  profileId?: string;
}

export interface EnemyWaveContentDef {
  id: string;
  startSec: number;
  durationSec: number;
  spawnEverySec: number;
  maxAlive: number;
  enemyTypeId: string;
  behaviorPresetId?: string;
  pattern?: any;
}

export interface EnemyContentBundle {
  enemyTypes: EnemyTypeContentDef[];
  behaviorPresets: BehaviorPreset[];
  behaviorGraphs: Record<string, BehaviorGraph>;
  waves: EnemyWaveContentDef[];
}
