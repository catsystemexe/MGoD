// src/game/enemies/behaviors/sine.ts
import type { EnemyBehavior } from "../EnemyBehaviorTypes";

function num(v: any, fallback: number): number {
  const n = typeof v === "number" ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}

export const sineBehavior: EnemyBehavior = {
  init: (e) => {
    if (!e.bState) e.bState = { t: 0 };

    const p = e.behavior ?? {};
    // params:
    // speedY: base falling speed
    // ampX: sine amplitude in logic units
    // freq: cycles per second
    // driftX: optional constant X drift
    const speedY = num(p.speedY, 35);
    const driftX = num(p.driftX, 0);

    // runtime: store base
    e.bState.t = 0;
    e.bState.baseSpeedY = speedY;
    e.bState.driftX = driftX;

    if (!e.vel) e.vel = { x: 0, y: 0 };
    e.vel.x = driftX;
    e.vel.y = speedY;
  },

  update: (e, ctx) => {
    if (!e.bState) e.bState = { t: 0 };
    e.bState.t += ctx.dt;

    const p = e.behavior ?? {};
    const ampX = num(p.ampX, 18);
    const freq = num(p.freq, 0.8); // Hz

    // vX is derivative of sine position; we use velocity directly (simple + stable)
    const t = e.bState.t;
    const omega = Math.PI * 2 * freq;
    const vxSine = ampX * omega * Math.cos(omega * t);

    const driftX = num(e.bState.driftX, 0);
    const vy = num(e.bState.baseSpeedY, 35);

    if (!e.vel) e.vel = { x: 0, y: 0 };
    e.vel.x = driftX + vxSine;
    e.vel.y = vy;
  },
};
