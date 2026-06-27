// src/game/enemies/behaviors/invaders.ts
import type { EnemyBehavior } from "../EnemyBehaviorTypes";
import type { TickContext } from "../../../engine/core/Loop";

function num(v: any, fallback: number): number {
  const n = typeof v === "number" ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}

export const invadersBehavior: EnemyBehavior = {
  init: (ent: any) => {
    const p = (ent?.behavior ?? {}) as any;
    const phaseStep = (typeof p.phaseStep === "number" && Number.isFinite(p.phaseStep)) ? p.phaseStep : 0.35;

    const x0 = num(ent?.pos?.x, 0);
    const y0 = num(ent?.pos?.y, 0);

    ent.bState ??= {};
    const t0 = num(ent.bState.t, 0);
    const ord = num((ent as any).spawnOrdinal, 0);
    ent.bState.t = t0;
    ent.bState.baseX = x0;
    ent.bState.baseY = y0;
    ent.bState.phase = ord * phaseStep;

    // cache params used by getTarget (prevents drift if params mutate)
    ent.bState.speedY = num(p.speedY, 14);
    ent.bState.speedX = num(p.speedX, 0);
    ent.bState.ampX = num(p.ampX, 26);
    ent.bState.freq = num(p.freq, 0.55);
  },

  update: (ent: any, ctx: TickContext) => {
    const dt = num((ctx as any)?.dt, 0);
    if (dt <= 0) return;

    ent.bState ??= {};
    const st = ent.bState as any;
    st.t = num(st.t, 0) + dt;
  },

  getTarget: (ent: any, _ctx: TickContext) => {
    ent.bState ??= {};
    const st = ent.bState as any;

    const t = num(st.t, 0);
    const baseX = num(st.baseX, num(ent?.pos?.x, 0));
    const baseY = num(st.baseY, num(ent?.pos?.y, 0));
    const phase = num(st.phase, 0);

    const speedY = num(st.speedY, 14);
    const speedX = num(st.speedX, 0);
    const ampX = num(st.ampX, 26);
    const freqHz = num(st.freq, 0.55);

    const a = (t * Math.PI * 2) * freqHz + phase;
    const targetX = baseX + Math.sin(a) * ampX + speedX * t;
    const targetY = baseY + speedY * t;

    return { x: targetX, y: targetY };
  },
};