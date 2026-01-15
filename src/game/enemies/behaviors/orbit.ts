import type { EnemyBehavior } from "../EnemyBehaviorTypes";
import type { TickContext } from "../../../engine/core/Loop";
import { num } from "./behaviorUtils";

export const orbitBehavior: EnemyBehavior = {
  init: (e: any) => {
    e.bState ??= {};
    const st = e.bState as any;
    const p = e.behavior ?? {};

    st.t = num(st.t, 0);
    st.cx = num(e.pos?.x, 0);
    st.cy = num(e.pos?.y, 0);

    st.radius = num(p.radius, 24);
    st.angularSpeed = num(p.angularSpeed, 0.8);
    st.speedY = num(p.speedY, 10);
  },

  update: (e: any, ctx: TickContext) => {
    const dt = num((ctx as any)?.dt, 0);
    if (dt <= 0) return;
    e.bState.t += dt;
  },

  getTarget: (e: any) => {
    const st = e.bState;
    const t = st.t;

    const a = t * st.angularSpeed;
    return {
      x: st.cx + Math.cos(a) * st.radius,
      y: st.cy + Math.sin(a) * st.radius + st.speedY * t,
    };
  },
};
