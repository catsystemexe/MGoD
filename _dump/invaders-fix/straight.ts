// src/game/enemies/behaviors/straight.ts
import type { EnemyBehavior } from "../EnemyBehaviorTypes";

function num(v: any, fallback: number): number {
  const n = typeof v === "number" ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}

export const straightBehavior: EnemyBehavior = {
  init: (e) => {
    if (!e.bState) e.bState = { t: 0 };
    // default params: { speedY?: number, speedX?: number }
    const p = e.behavior ?? {};
    const vx = num(p.speedX, 0);
    const vy = num(p.speedY, 40);

    if (!e.vel) e.vel = { x: 0, y: 0 };
    e.vel.x = vx;
    e.vel.y = vy;
  },

  update: (e, ctx) => {
    // straight: velocity stays constant, only time accumulates
    if (!e.bState) e.bState = { t: 0 };
    e.bState.t += ctx.dt;
  },
};
