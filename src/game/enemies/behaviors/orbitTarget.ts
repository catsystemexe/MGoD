import type { EnemyBehavior } from "../EnemyBehaviorTypes";
import type { SmartBehaviorContext } from "./smartContext";
import { clamp, num, positive } from "./smartContext";

function directionSign(v: unknown): number {
  return num(v, 1) < 0 ? -1 : 1;
}

function deterministicInitialAngle(e: any): number {
  const ord = Math.floor(Math.abs(num(e?.spawnOrdinal, num(e?.pos?.x, 0) + num(e?.pos?.y, 0))));
  return ord % 2 === 0 ? 0 : Math.PI;
}

function finitePlayer(ctx: SmartBehaviorContext | undefined): { x: number; y: number } | null {
  const x = ctx?.playerPos?.x;
  const y = ctx?.playerPos?.y;
  return Number.isFinite(x) && Number.isFinite(y) ? { x: x as number, y: y as number } : null;
}

export const orbitTargetBehavior: EnemyBehavior = {
  init: (e: any) => {
    e.bState ??= {};
    const st = e.bState as any;
    const p = (e.behavior ?? {}) as any;
    st.t = 0;
    st.initialized = false;
    st.radiusX = positive(p.radiusX, 96, 1);
    st.radiusY = positive(p.radiusY, 72, 1);
    st.angularSpeed = positive(p.angularSpeed, Math.PI, 0.001);
    st.arcRadians = positive(p.arcRadians, Math.PI * 2, 0.001);
    st.direction = directionSign(p.direction);
    st.repeat = p.repeat === true;
    st.radialResponse = positive(p.radialResponse, 2.6, 0.001);
    st.maxRadialSpeed = positive(p.maxRadialSpeed, 90, 0);
    st.targetOffsetX = num(p.targetOffsetX, 0);
    st.targetOffsetY = num(p.targetOffsetY, 0);
    st.fallbackSpeedX = num(p.fallbackSpeedX, -80);
    st.fallbackSpeedY = num(p.fallbackSpeedY, 0);
    st.startAngle = 0;
    st.currentRadiusX = st.radiusX;
    st.currentRadiusY = st.radiusY;
    st.lastPlayerX = 0;
    st.lastPlayerY = 0;
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
    const player = finitePlayer(ctx);
    if (!player) {
      return {
        x: currentX + num(st.fallbackSpeedX, -80) * dt,
        y: currentY + num(st.fallbackSpeedY, 0) * dt,
      };
    }

    const centerX = player.x + num(st.targetOffsetX, 0);
    const centerY = player.y + num(st.targetOffsetY, 0);
    if (st.initialized !== true) {
      const dx = currentX - centerX;
      const dy = currentY - centerY;
      const rx = positive(st.radiusX, 96, 1);
      const ry = positive(st.radiusY, 72, 1);
      const initialDistance = Math.hypot(dx, dy);
      const angle = initialDistance <= 0.0001 ? deterministicInitialAngle(e) : Math.atan2(dy / ry, dx / rx);
      st.startAngle = Number.isFinite(angle) ? angle : 0;
      st.currentRadiusX = initialDistance <= 0.0001 ? 0 : Math.max(1, Math.abs(dx / Math.cos(st.startAngle)) || Math.abs(dx) || rx);
      st.currentRadiusY = initialDistance <= 0.0001 ? 0 : Math.max(1, Math.abs(dy / Math.sin(st.startAngle)) || Math.abs(dy) || ry);
      st.lastPlayerX = centerX;
      st.lastPlayerY = centerY;
      st.initialized = true;
      return { x: currentX, y: currentY };
    }

    const elapsed = Math.max(0, num(st.t, 0));
    const angularSpeed = positive(st.angularSpeed, Math.PI, 0.001);
    const arc = positive(st.arcRadians, Math.PI * 2, 0.001);
    const rawDelta = angularSpeed * elapsed;
    const angleDelta = st.repeat === true ? rawDelta % arc : Math.min(rawDelta, arc);
    const angle = num(st.startAngle, 0) + directionSign(st.direction) * angleDelta;

    const targetRx = positive(st.radiusX, 96, 1);
    const targetRy = positive(st.radiusY, 72, 1);
    const maxRadialStep = positive(st.maxRadialSpeed, 90, 0) * dt;
    const radialAlpha = 1 - Math.exp(-positive(st.radialResponse, 2.6, 0.001) * dt);
    const currentRx = positive(st.currentRadiusX, targetRx, 0);
    const currentRy = positive(st.currentRadiusY, targetRy, 0);
    st.currentRadiusX = currentRx + clamp((targetRx - currentRx) * radialAlpha, -maxRadialStep, maxRadialStep);
    st.currentRadiusY = currentRy + clamp((targetRy - currentRy) * radialAlpha, -maxRadialStep, maxRadialStep);

    st.lastPlayerX = centerX;
    st.lastPlayerY = centerY;
    return {
      x: centerX + positive(st.currentRadiusX, targetRx, 0) * Math.cos(angle),
      y: centerY + positive(st.currentRadiusY, targetRy, 0) * Math.sin(angle),
    };
  },
};
