// src/game/enemies/behaviors/straight.ts
import type { EnemyBehavior } from "../EnemyBehaviorTypes";
import type { TickContext } from "../../../engine/core/Loop";

function num(v: any, fallback: number): number {
  const n = typeof v === "number" ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function integratedLerp(start: number, end: number, t: number, duration: number): number {
  if (t <= 0) return 0;
  const activeT = Math.min(t, duration);
  const u = clamp01(activeT / duration);
  const interpDistance = duration * (start * u + (end - start) * u * u * 0.5);
  const afterDistance = t > duration ? end * (t - duration) : 0;
  return interpDistance + afterDistance;
}

export const straightBehavior: EnemyBehavior = {
  init: (e: any) => {
    e.bState ??= {};

    const p = (e.behavior ?? {}) as any;
    const vx = num(p.speedX, 0);
    const vy = num(p.speedY, 40);
    const vxStart = num(p.speedXStart, vx);
    const vxEnd = num(p.speedXEnd, vx);
    const vyStart = num(p.speedYStart, vy);
    const vyEnd = num(p.speedYEnd, vy);
    const duration = Math.max(0.001, num(p.duration, 0));

    const x0 = num(e.pos?.x, 0);
    const y0 = num(e.pos?.y, 0);

    const t0 = num(e.bState.t, 0);
    e.bState.t = t0;
    e.bState.baseX = x0;
    e.bState.baseY = y0;
    e.bState.vx = vx;
    e.bState.vy = vy;
    e.bState.vxStart = vxStart;
    e.bState.vxEnd = vxEnd;
    e.bState.vyStart = vyStart;
    e.bState.vyEnd = vyEnd;
    e.bState.duration = duration;
    e.bState.hasInterpolation =
      typeof p.speedXStart === "number" ||
      typeof p.speedXEnd === "number" ||
      typeof p.speedYStart === "number" ||
      typeof p.speedYEnd === "number" ||
      typeof p.duration === "number";
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

    if (st.hasInterpolation) {
      const duration = Math.max(0.001, num(st.duration, 0));
      const vxStart = num(st.vxStart, vx);
      const vxEnd = num(st.vxEnd, vx);
      const vyStart = num(st.vyStart, vy);
      const vyEnd = num(st.vyEnd, vy);
      return {
        x: baseX + integratedLerp(vxStart, vxEnd, t, duration),
        y: baseY + integratedLerp(vyStart, vyEnd, t, duration),
      };
    }

    return { x: baseX + vx * t, y: baseY + vy * t };
  },
};
