import type { EnemyBehavior } from "../EnemyBehaviorTypes";
import type { SmartBehaviorContext } from "./smartContext";
import { clamp, num, positive } from "./smartContext";

function deterministicFallbackDir(e: any): { x: number; y: number } {
  const ord = Math.floor(Math.abs(num(e?.spawnOrdinal, 0)));
  return { x: ord % 2 === 0 ? 1 : -1, y: 0 };
}

export const rangeBehavior: EnemyBehavior = {
  init: (e: any) => {
    e.bState ??= {};
    const st = e.bState as any;
    const p = (e.behavior ?? {}) as any;
    st.t = 0;
    st.preferredDistance = positive(p.preferredDistance, 180, 1);
    st.tolerance = positive(p.tolerance, 16, 0);
    st.response = positive(p.response, 3, 0.001);
    st.maxSpeed = positive(p.maxSpeed, 120, 0);
    st.fallbackSpeedX = num(p.fallbackSpeedX, -90);
    st.fallbackSpeedY = num(p.fallbackSpeedY, 0);
    st.targetOffsetX = num(p.targetOffsetX, 0);
    st.targetOffsetY = num(p.targetOffsetY, 0);
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
    const dt = Math.max(0.0001, num(ctx?.dt, 1 / 60));
    const currentX = num(e.pos?.x, 0);
    const currentY = num(e.pos?.y, 0);
    const player = ctx?.playerPos;
    if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.y)) {
      return {
        x: currentX + num(st.fallbackSpeedX, -90) * dt,
        y: currentY + num(st.fallbackSpeedY, 0) * dt,
      };
    }

    const targetX = player.x + num(st.targetOffsetX, 0);
    const targetY = player.y + num(st.targetOffsetY, 0);
    let dx = currentX - targetX;
    let dy = currentY - targetY;
    let dist = Math.hypot(dx, dy);
    if (dist <= 0.0001) {
      const fallback = deterministicFallbackDir(e);
      dx = fallback.x;
      dy = fallback.y;
      dist = 1;
    }

    const preferred = positive(st.preferredDistance, 180, 1);
    const tolerance = positive(st.tolerance, 16, 0);
    const error = dist - preferred;
    if (Math.abs(error) <= tolerance) return { x: currentX, y: currentY };

    const response = positive(st.response, 3, 0.001);
    const maxStep = positive(st.maxSpeed, 120, 0) * dt;
    const desiredStep = error * (1 - Math.exp(-response * dt));
    const radialStep = clamp(desiredStep, -maxStep, maxStep);
    const ux = dx / dist;
    const uy = dy / dist;
    return {
      x: currentX - ux * radialStep,
      y: currentY - uy * radialStep,
    };
  },
};
