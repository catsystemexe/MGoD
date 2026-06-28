// src/game/enemies/behaviors/zigzag.ts
import type { TickContext } from "../../../engine/core/Loop";
import type { EnemyBehavior } from "../EnemyBehaviorTypes";

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}

function triangleWave01(t: number): number {
  const phase = t - Math.floor(t);
  return phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
}

export const zigzagBehavior: EnemyBehavior = {
  init: (e: any) => {
    e.bState ??= {};

    const p = (e.behavior ?? {}) as any;
    const x0 = num(e.pos?.x, 0);
    const y0 = num(e.pos?.y, 0);

    e.bState.t = num(e.bState.t, 0);
    e.bState.baseX = x0;
    e.bState.baseY = y0;
    e.bState.speedX = num(p.speedX, -150);
    e.bState.speedY = num(p.speedY, 0);
    e.bState.ampY = num(p.ampY, 70);
    e.bState.period = Math.max(0.1, num(p.period, 0.75));
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
    const speedX = num(st.speedX, -150);
    const speedY = num(st.speedY, 0);
    const ampY = num(st.ampY, 70);
    const period = Math.max(0.1, num(st.period, 0.75));

    return {
      x: baseX + speedX * t,
      y: baseY + speedY * t + triangleWave01(t / period) * ampY,
    };
  },
};
