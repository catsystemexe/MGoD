// src/game/enemies/behaviors/none.ts
import type { EnemyBehavior } from "../EnemyBehaviorTypes";

export const noneBehavior: EnemyBehavior = {
  init: (e) => {
    if (!e.vel) e.vel = { x: 0, y: 0 };
    if (!e.bState) e.bState = { t: 0 };
  },
  update: (_e, _ctx) => {
    // no-op
  },
};
