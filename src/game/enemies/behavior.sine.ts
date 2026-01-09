import type { EnemyBehavior } from "./EnemyBehaviorDB";

export const SineBehavior: EnemyBehavior = {
  init(e) {
    e.bState.t = 0;
    e.bState.baseX = e.pos.x;
  },

  update(e, ctx) {
    const amp = e.behavior.amplitude ?? 20;
    const freq = e.behavior.frequency ?? 2;
    const speed = e.behavior.speed ?? 30;

    e.bState.t += ctx.dt;

    e.pos.y += speed * ctx.dt;
    e.pos.x = (e.bState.baseX ?? e.pos.x)
      + Math.sin(e.bState.t * freq) * amp;
  },
};
