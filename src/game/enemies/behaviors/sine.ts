// src/game/enemies/behaviors/sine.ts
import type { EnemyBehavior } from "../EnemyBehaviorTypes";

const num = (v: any, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export const sineBehavior: EnemyBehavior = {
  init: (e: any) => {
    if (!e.vel) e.vel = { x: 0, y: 0 };
    if (!e.bState) e.bState = { t: 0 };

    // defaults
    const speed = num(e.behavior?.speed, 40);
    const amp   = num(e.behavior?.amp,  20);
    const freq  = num(e.behavior?.freq, 1.2);

    e.behavior = { ...(e.behavior ?? {}), speed, amp, freq };

    // remember spawn x (critical)
    e.bState.t = 0;
    e.bState.baseX = num(e.pos?.x, 0);

    // vertical drift always on (so it actually enters screen)
    e.vel.y = speed;
    e.vel.x = 0;
  },

  update: (e: any, ctx: any) => {
    const dt = num(ctx?.dt, 0);
    e.bState.t = num(e.bState.t, 0) + dt;

    const amp  = num(e.behavior?.amp, 20);
    const freq = num(e.behavior?.freq, 1.2);
    const baseX = num(e.bState?.baseX, num(e.pos?.x, 0));

    // Option A: set pos.x directly (simple & stable)
    e.pos.x = baseX + Math.sin(e.bState.t * (Math.PI * 2) * freq) * amp;

    // vel.y stays from init (or allow override)
    // e.vel.y = num(e.behavior?.speed, e.vel.y);
  },
};