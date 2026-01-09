import type { EnemyBehaviorId } from "../enemies/EnemyBehaviorTypes";

export type EnemyTypeId = "enemy.drone" | "enemy.sine";

export interface EnemyDef {
  hp: number;
  radius: number;
  behaviorId: EnemyBehaviorId;
  behavior?: Record<string, any>;
}

export const ENEMY_DEFS: Record<EnemyTypeId, EnemyDef> = {
  "enemy.drone": {
    hp: 6,
    radius: 4,
    behaviorId: "straight",
    behavior: { speed: 40 },
  },

  "enemy.sine": {
    hp: 8,
    radius: 4,
    behaviorId: "sine",
    behavior: {
      speed: 30,
      amplitude: 24,
      frequency: 3,
    },
  },
};
