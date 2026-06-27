// src/game/enemies/behaviors/none.ts
import type { EnemyBehavior } from "../EnemyBehaviorTypes";
import type { TickContext } from "../../../engine/core/Loop";

export const noneBehavior: EnemyBehavior = {
  init: (e: any) => {
    e.bState ??= { t: 0 };
  },

  // V1: no target => EnemySystem keeps vel unless failsafe kicks in
  getTarget: (_e: any, _ctx: TickContext) => null,
};