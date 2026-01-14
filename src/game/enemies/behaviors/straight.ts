// src/game/enemies/behaviors/straight.ts
import type { EnemyBehavior } from "../EnemyBehaviorTypes";
import type { TickContext } from "../../../engine/core/Loop";

function num(v: any, fallback: number): number {
  const n = typeof v === "number" ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}

export const straightBehavior: EnemyBehavior = {
  init: (e: any) => {
    e.bState ??= {};

    const p = (e.behavior ?? {}) as any;
    const vx = num(p.speedX, 0);
    const vy = num(p.speedY, 40);

    const x0 = num(e.pos?.x, 0);
    const y0 = num(e.pos?.y, 0);

    const t0 = num(e.bState.t, 0);
    e.bState.t = t0;
    e.bState.baseX = x0;
    e.bState.baseY = y0;
    e.bState.vx = vx;
    e.bState.vy = vy;
  },

  update: (e: any, ctx: TickContext) => {
    const dt = num((ctx as any)?.dt, 0);
    if (dt <= 0) return;
    e.bState ??= {};
    e.bState.t = num(e.bState.t, 0) + dt;
  },

  getTarget: (e: any, _ctx: TickContext) => {
    e.bState ??= {};
    const st = e.bState as any;

    const t = num(st.t, 0);
    const baseX = num(st.baseX, num(e.pos?.x, 0));
    const baseY = num(st.baseY, num(e.pos?.y, 0));
    const vx = num(st.vx, 0);
    const vy = num(st.vy, 40);

    return { x: baseX + vx * t, y: baseY + vy * t };
  },
};