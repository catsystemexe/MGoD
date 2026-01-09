import type { EnemyBehavior } from "../EnemyBehaviorTypes";

export const straightBehavior: EnemyBehavior = {
  init(e) {
    const speed = e.behavior?.speed ?? 40;
    e.vel = { x: 0, y: speed };
  },

  update(_e, _ctx) {
    // velocity already set, nothing to do
  },
};
