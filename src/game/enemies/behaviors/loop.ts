import type { TickContext } from "../../../engine/core/Loop";
import type { EnemyBehavior } from "../EnemyBehaviorTypes";

function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}

function positive(v: unknown, fallback: number, min: number): number {
  return Math.max(min, num(v, fallback));
}

function directionSign(v: unknown): number {
  return num(v, 1) < 0 ? -1 : 1;
}

export const loopBehavior: EnemyBehavior = {
  init: (e: any) => {
    e.bState ??= {};

    const st = e.bState as any;
    const p = (e.behavior ?? {}) as any;
    const x0 = num(e.pos?.x, 0);
    const y0 = num(e.pos?.y, 0);
    const duration = positive(p.duration, 1.75, 0.05);
    const turns = positive(p.turns, 1, 0.001);
    const angularSpeed = typeof p.angularSpeed === "number" && Number.isFinite(p.angularSpeed)
      ? Math.max(0.001, Math.abs(p.angularSpeed))
      : (Math.PI * 2 * turns) / duration;
    const initialAngle = num(p.initialAngle, 0);

    st.t = num(st.t, 0);
    st.baseX = x0;
    st.baseY = y0;
    st.speedX = num(p.speedX, -95);
    st.speedY = num(p.speedY, 0);
    st.radiusX = positive(p.radiusX, 56, 0);
    st.radiusY = positive(p.radiusY, 56, 0);
    st.angularSpeed = angularSpeed;
    st.direction = directionSign(p.direction);
    st.turns = turns;
    st.repeat = p.repeat === true;
    st.initialAngle = initialAngle;
    st.totalAngle = Math.PI * 2 * turns;
    st.duration = st.totalAngle / angularSpeed;
  },

  update: (e: any, ctx: TickContext) => {
    const dt = num((ctx as any)?.dt, 0);
    if (dt <= 0) return;
    e.bState ??= {};
    e.bState.t = num(e.bState.t, 0) + dt;
  },

  getTarget: (e: any, _ctx: TickContext) => {
    e.bState ??= {};
    const st = e.bState as any;

    const t = Math.max(0, num(st.t, 0));
    const baseX = num(st.baseX, num(e.pos?.x, 0));
    const baseY = num(st.baseY, num(e.pos?.y, 0));
    const speedX = num(st.speedX, -95);
    const speedY = num(st.speedY, 0);
    const radiusX = positive(st.radiusX, 56, 0);
    const radiusY = positive(st.radiusY, 56, 0);
    const angularSpeed = positive(st.angularSpeed, Math.PI * 2, 0.001);
    const direction = directionSign(st.direction);
    const initialAngle = num(st.initialAngle, 0);
    const totalAngle = positive(st.totalAngle, Math.PI * 2, 0.001);
    const rawAngleDelta = angularSpeed * t;
    const angleDelta = st.repeat === true ? rawAngleDelta % totalAngle : Math.min(rawAngleDelta, totalAngle);
    const angle = initialAngle + direction * angleDelta;

    return {
      x: baseX + speedX * t + radiusX * (Math.cos(angle) - Math.cos(initialAngle)),
      y: baseY + speedY * t + radiusY * (Math.sin(angle) - Math.sin(initialAngle)),
    };
  },
};
