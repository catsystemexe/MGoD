// src/game/enemies/EnemyBehaviorTypes.ts

export type EnemyBehaviorId = "none" | "straight" | "sine";

export type EnemyBehavior = {
  init?: (e: any) => void;
  update?: (e: any, dt: number) => void;
};