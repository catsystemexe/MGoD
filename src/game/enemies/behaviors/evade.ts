import type { EnemyBehavior } from "../EnemyBehaviorTypes";
import type { SmartBehaviorContext } from "./smartContext";
import { clamp, num, playerTargetY, positive } from "./smartContext";

function deterministicTieBreak(e: any): number {
  const ord = num(e?.spawnOrdinal, num(e?.pos?.x, 0) + num(e?.pos?.y, 0));
  return Math.floor(Math.abs(ord)) % 2 === 0 ? -1 : 1;
}

export const evadeBehavior: EnemyBehavior = {
  init: (e: any) => {
    e.bState ??= {};
    const st = e.bState as any;
    const p = (e.behavior ?? {}) as any;
    st.t = 0;
    st.baseX = num(e.pos?.x, 0);
    st.speedX = num(p.speedX, -115);
    st.triggerBandY = positive(p.triggerBandY, 44, 0);
    st.evadeSpeedY = positive(p.evadeSpeedY, 150, 0);
    st.evadeDuration = positive(p.evadeDuration, 0.75, 0.001);
    st.cooldown = positive(p.cooldown, 0.45, 0);
    st.driftY = num(p.driftY, 0);
    st.paddingY = positive(p.paddingY, 24, 0);
    st.offsetY = num(p.offsetY, 0);
    st.evadeTimeLeft = 0;
    st.cooldownLeft = 0;
    st.evadeDir = 0;
  },

  update: (e: any, ctx: SmartBehaviorContext) => {
    const dt = num(ctx?.dt, 0);
    if (dt <= 0) return;
    e.bState ??= {};
    const st = e.bState as any;
    st.t = num(st.t, 0) + dt;
    const activeTime = num(st.evadeTimeLeft, 0);
    if (activeTime > 0) {
      const nextActiveTime = Math.max(0, activeTime - dt);
      st.evadeTimeLeft = nextActiveTime;
      if (nextActiveTime === 0) st.cooldownLeft = positive(st.cooldown, 0.45, 0);
      return;
    }

    st.cooldownLeft = Math.max(0, num(st.cooldownLeft, 0) - dt);

    const targetY = playerTargetY(ctx, num(st.offsetY, 0));
    if (targetY === null || num(st.cooldownLeft, 0) > 0) return;

    const y = num(e.pos?.y, 0);
    const delta = y - targetY;
    if (Math.abs(delta) > positive(st.triggerBandY, 44, 0)) return;

    st.evadeDir = delta === 0 ? deterministicTieBreak(e) : (delta < 0 ? -1 : 1);
    st.evadeTimeLeft = positive(st.evadeDuration, 0.75, 0.001);
    st.cooldownLeft = 0;
  },

  getTarget: (e: any, ctx: SmartBehaviorContext) => {
    e.bState ??= {};
    const st = e.bState as any;
    const t = num(st.t, 0);
    const x = num(st.baseX, num(e.pos?.x, 0)) + num(st.speedX, -115) * t;
    const currentY = num(e.pos?.y, 0);
    const dt = Math.max(0.0001, num(ctx?.dt, 1 / 60));
    const dir = num(st.evadeTimeLeft, 0) > 0 ? Math.sign(num(st.evadeDir, 0)) : 0;
    const speedY = dir === 0 ? num(st.driftY, 0) : dir * positive(st.evadeSpeedY, 150, 0);
    let y = currentY + speedY * dt;
    const logicH = num(ctx?.logicH, NaN);
    if (Number.isFinite(logicH) && logicH > 0) {
      const pad = positive(st.paddingY, 24, 0);
      y = clamp(y, pad, Math.max(pad, logicH - pad));
    }
    return { x, y };
  },
};
