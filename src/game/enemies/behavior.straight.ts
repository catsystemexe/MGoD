import type { EnemyBehavior } from "./EnemyBehaviorDB";

export const StraightBehavior: EnemyBehavior = {
  init(e) {
    // nothing special
  },

  update(e, ctx) {
    const speed = e.behavior.speed ?? e.vel.y ?? 40;
    e.pos.y += speed * ctx.dt;
  },
};
