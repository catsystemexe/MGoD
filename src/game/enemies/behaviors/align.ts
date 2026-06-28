import type { EnemyBehavior } from "../EnemyBehaviorTypes";
import type { SmartBehaviorContext } from "./smartContext";
import { clamp, num, playerTargetY, positive } from "./smartContext";

export const alignBehavior: EnemyBehavior = {
  init: (e: any) => {
    e.bState ??= {};
    const st = e.bState as any;
    const p = (e.behavior ?? {}) as any;
    st.t = 0;
    st.baseX = num(e.pos?.x, 0);
    st.speedX = num(p.speedX, -70);
    st.alignSpeedY = positive(p.alignSpeedY, 130, 0);
    st.toleranceY = positive(p.toleranceY, 8, 0);
    st.offsetY = num(p.offsetY, 0);
    st.lastY = num(e.pos?.y, 0);
  },

  update: (e: any, ctx: SmartBehaviorContext) => {
    const dt = num(ctx?.dt, 0);
    if (dt <= 0) return;
    e.bState ??= {};
    e.bState.t = num(e.bState.t, 0) + dt;
  },

  getTarget: (e: any, ctx: SmartBehaviorContext) => {
    e.bState ??= {};
    const st = e.bState as any;
    const t = num(st.t, 0);
    const x = num(st.baseX, num(e.pos?.x, 0)) + num(st.speedX, -70) * t;
    const currentY = num(e.pos?.y, num(st.lastY, 0));
    const targetY = playerTargetY(ctx, num(st.offsetY, 0));
    if (targetY === null) return { x, y: currentY };

    const delta = targetY - currentY;
    const toleranceY = positive(st.toleranceY, 8, 0);
    if (Math.abs(delta) <= toleranceY) return { x, y: currentY };

    const dt = Math.max(0.0001, num(ctx?.dt, 1 / 60));
    const maxStep = positive(st.alignSpeedY, 130, 0) * dt;
    const step = clamp(delta, -maxStep, maxStep);
    const y = currentY + step;
    st.lastY = y;
    return { x, y };
  },
};
