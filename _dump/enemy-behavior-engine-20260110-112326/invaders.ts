// src/game/enemies/behaviors/invaders.ts
import type { EnemyBehavior } from "../EnemyBehaviorTypes";

export const invadersBehavior: EnemyBehavior = {
  init(ent: any) {
    // defaults (můžeš přepsat přes preset/params)
    ent.behavior = ent.behavior || {};
    if (typeof ent.behavior.speedX !== "number") ent.behavior.speedX = 28;
    if (typeof ent.behavior.driftY !== "number") ent.behavior.driftY = 6;
    if (typeof ent.behavior.stepDown !== "number") ent.behavior.stepDown = 10;
    if (typeof ent.behavior.minX !== "number") ent.behavior.minX = 12;
    if (typeof ent.behavior.maxX !== "number") ent.behavior.maxX = 400 - 12;

    ent.bState = ent.bState || { t: 0 };
    ent.bState.dir = (ent.bState.dir === -1 || ent.bState.dir === 1) ? ent.bState.dir : 1;
  },

  update(ent: any, dt: number) {
    if (!ent?.pos) return;

    const b = ent.behavior || {};
    const speedX = +b.speedX || 28;
    const driftY = +b.driftY || 0;
    const stepDown = +b.stepDown || 10;
    const minX = (typeof b.minX === "number") ? b.minX : 12;
    const maxX = (typeof b.maxX === "number") ? b.maxX : (400 - 12);

    ent.bState = ent.bState || { t: 0 };
    let dir = (ent.bState.dir === -1 || ent.bState.dir === 1) ? ent.bState.dir : 1;

    // sideways
    ent.pos.x += dir * speedX * dt;

    // edge -> flip + step-down
    if (ent.pos.x <= minX) {
      ent.pos.x = minX;
      dir = 1;
      ent.pos.y += stepDown;
    } else if (ent.pos.x >= maxX) {
      ent.pos.x = maxX;
      dir = -1;
      ent.pos.y += stepDown;
    }

    // optional slow drift down
    if (driftY) ent.pos.y += driftY * dt;

    ent.bState.dir = dir;
    ent.bState.t = (ent.bState.t || 0) + dt;
  },
};
