// src/game/enemies/behaviors/sine.ts
import type { EnemyBehavior } from "../EnemyBehaviorTypes";
import type { TickContext } from "../../../engine/core/Loop";

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}

function phaseFromSpawn(spawnOrdinal: number, phaseStep: number): number {
  return spawnOrdinal * phaseStep;
}

export const sineBehavior: EnemyBehavior = {
  init: (e: any) => {
    e.bState ??= {};

    const st = e.bState as any;
    const p = (e.behavior ?? {}) as any;

    const speedY = num(p.speedY, 35);
    const driftX = num(p.driftX, 0);

    const x0 = num(e.pos?.x, 0);
    const y0 = num(e.pos?.y, 0);

    const phaseStep = num(p.phaseStep, 0.35);
    const ord = num((e as any).spawnOrdinal, 0);
    const phase = phaseFromSpawn(ord, phaseStep);

    // IMPORTANT:
    // - SpawnSystem may pre-seed bState.t from spawnAgeSec (backlog catch-up).
    // - Do NOT overwrite it.
    st.t = num(st.t, 0);

    // base anchors are the spawn position at creation time (stable formation)
    st.baseX = num(st.baseX, x0);
    st.baseY = num(st.baseY, y0);

    st.baseSpeedY = num(st.baseSpeedY, speedY);
    st.driftX = num(st.driftX, driftX);
    st.phase = num(st.phase, phase);

    // NOTE: do not touch e.vel here (EnemySystem is single authority)
  },

  update: (e: any, ctx: TickContext) => {
    const dt = num((ctx as any)?.dt, 0);
    if (dt <= 0) return;

    e.bState ??= {};
    const st = e.bState as any;

    // advance internal time only
    st.t = num(st.t, 0) + dt;
  },

  // V1 contract: analytic target (EnemySystem derives vel)
  getTarget: (e: any, _ctx: TickContext) => {
    e.bState ??= {};
    const st = e.bState as any;

    const p = (e.behavior ?? {}) as any;
    const ampX = num(p.ampX, 18);
    const freq = num(p.freq, 0.8); // Hz

    const t = num(st.t, 0);
    const omega = Math.PI * 2 * freq;

    const baseX = num(st.baseX, num(e.pos?.x, 0));
    const baseY = num(st.baseY, num(e.pos?.y, 0));
    const phase = num(st.phase, 0);

    const driftX = num(st.driftX, 0);
    const speedY = num(st.baseSpeedY, 35);

    const a = omega * t + phase;

    return {
      x: baseX + Math.sin(a) * ampX + driftX * t,
      y: baseY + speedY * t,
    };
  },
};
