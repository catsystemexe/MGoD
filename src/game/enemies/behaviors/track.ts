import type { EnemyBehavior } from "../EnemyBehaviorTypes";
import type { SmartBehaviorContext } from "./smartContext";
import { clamp, num, playerTargetY, positive } from "./smartContext";

export const trackBehavior: EnemyBehavior = {
  init: (e: any) => {
    e.bState ??= {};
    const st = e.bState as any;
    const p = (e.behavior ?? {}) as any;
    st.t = 0;
    st.baseX = num(e.pos?.x, 0);
    st.speedX = num(p.speedX, -110);
    st.response = positive(p.response, 2.4, 0.001);
    st.maxSpeedY = positive(p.maxSpeedY, 70, 0);
    st.deadZoneY = positive(p.deadZoneY, 12, 0);
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
    const x = num(st.baseX, num(e.pos?.x, 0)) + num(st.speedX, -110) * t;
    const currentY = num(e.pos?.y, num(st.lastY, 0));
    const targetY = playerTargetY(ctx, num(st.offsetY, 0));
    if (targetY === null) return { x, y: currentY };

    const delta = targetY - currentY;
    const deadZoneY = positive(st.deadZoneY, 12, 0);
    if (Math.abs(delta) <= deadZoneY) return { x, y: currentY };

    const dt = Math.max(0.0001, num(ctx?.dt, 1 / 60));
    const response = positive(st.response, 2.4, 0.001);
    const maxStep = positive(st.maxSpeedY, 70, 0) * dt;
    const desiredStep = delta * (1 - Math.exp(-response * dt));
    const step = clamp(desiredStep, -maxStep, maxStep);
    const y = currentY + step;
    st.lastY = y;
    return { x, y };
  },
};
