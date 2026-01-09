import type { EnemyBehavior } from "../EnemyBehaviorTypes";

export const noneBehavior: EnemyBehavior = {
  init(e) {
    if (!e.vel) e.vel = { x: 0, y: 0 };
  },
  update() {
    // no-op
  },
};
