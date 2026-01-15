// src/game/enemies/behaviors/zigzag.ts
import type { EnemyBehavior } from "../EnemyBehaviorTypes";
import type { TickContext } from "../../../engine/core/Loop";

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}

// triangle wave in [-1, +1]
function tri01(t: number): number {
  const x = t - Math.floor(t);      // [0..1)
  const y = x < 0.5 ? (x * 2) : (2 - x * 2); // [0..1..0]
  return y * 2 - 1;                 // [-1..+1]
}

export const zigzagBehavior: EnemyBehavior = {
  init: (e: any) => {
    e.bState ??= {};
    const st = e.bState as any;
    const p = (e.behavior ?? {}) as any;

    const x0 = num(e.pos?.x, 0);
    const y0 = num(e.pos?.y, 0);

    // preserve pre-seeded t (spawnAgeSec)
    st.t = num(st.t, 0);

    st.baseX = num(st.baseX, x0);
    st.baseY = num(st.baseY, y0);

    // cache params for stability
    st.speedY = num(p.speedY, 22);
    st.ampX = num(p.ampX, 18);
    st.periodSec = Math.max(0.05, num(p.periodSec, 0.9));

    const ord = num((e as any).spawnOrdinal, 0);
    st.phase = num(st.phase, ord * 0.17); // deterministic offset
  },

  update: (e: any, ctx: TickContext) => {
    const dt = num((ctx as any)?.dt, 0);
    if (dt <= 0) return;
    e.bState ??= {};
    const st = e.bState as any;
    st.t = num(st.t, 0) + dt;
  },

  getTarget: (e: any, _ctx: TickContext) => {
    e.bState ??= {};
    const st = e.bState as any;

    const t = num(st.t, 0);
    const baseX = num(st.baseX, num(e.pos?.x, 0));
    const baseY = num(st.baseY, num(e.pos?.y, 0));

    const speedY = num(st.speedY, 22);
    const ampX = num(st.ampX, 18);
    const periodSec = Math.max(0.05, num(st.periodSec, 0.9));
    const phase = num(st.phase, 0);

    const u = (t / periodSec) + phase;
    const x = baseX + tri01(u) * ampX;
    const y = baseY + speedY * t;

    return { x, y };
  },
};