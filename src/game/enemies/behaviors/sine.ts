// src/game/enemies/behaviors/sine.ts
import type { EnemyBehavior } from "../EnemyBehaviorTypes";

function num(v: any, fallback: number): number {
  const n = typeof v === "number" ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}

// Deterministic-ish phase from spawn position (stable per enemy)
function phaseFromSpawn(x0: number, y0: number, phaseStep: number): number {
  const idx = (Math.floor((x0 + y0) * 0.25) % 999) | 0;
  return idx * phaseStep;
}

export const sineBehavior: EnemyBehavior = {
  init: (e) => {
    e.bState = e.bState || {};

    const p = e.behavior ?? {};
    const speedY = num(p.speedY, 35);
    const driftX = num(p.driftX, 0);

    // store base anchors (formation lock)
    const x0 = num(e.pos?.x, 0);
    const y0 = num(e.pos?.y, 0);

    const phaseStep = num(p.phaseStep, 0.35);
    const phase = phaseFromSpawn(x0, y0, phaseStep);

    e.bState.t = 0;
    e.bState.baseX = x0;
    e.bState.baseY = y0;
    e.bState.baseSpeedY = speedY;
    e.bState.driftX = driftX;
    e.bState.phase = phase;

    e.vel = e.vel || { x: 0, y: 0 };
  },

  update: (e, ctx) => {
    const dt = num((ctx as any)?.dt, 0);
    if (dt <= 0) return;

    e.bState = e.bState || {};
    e.bState.t = num(e.bState.t, 0) + dt;

    const p = e.behavior ?? {};
    const ampX = num(p.ampX, 18);
    const freq = num(p.freq, 0.8); // Hz

    const t = num(e.bState.t, 0);
    const omega = Math.PI * 2 * freq;

    const baseX = num(e.bState.baseX, num(e.pos?.x, 0));
    const baseY = num(e.bState.baseY, num(e.pos?.y, 0));
    const phase = num(e.bState.phase, 0);

    const driftX = num(e.bState.driftX, 0);
    const speedY = num(e.bState.baseSpeedY, 35);

    // analytic target (formation-stable)
    const a = omega * t + phase;
    const targetX = baseX + Math.sin(a) * ampX + driftX * t;
    const targetY = baseY + speedY * t;

    const px = num(e.pos?.x, 0);
    const py = num(e.pos?.y, 0);

    e.vel = e.vel || { x: 0, y: 0 };
    e.vel.x = (targetX - px) / dt;
    e.vel.y = (targetY - py) / dt;
  },
};
