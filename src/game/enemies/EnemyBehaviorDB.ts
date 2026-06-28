
// src/game/enemies/EnemyBehaviorDB.ts
import type { EnemyBehaviorId, EnemyBehavior } from "./EnemyBehaviorTypes";

import { noneBehavior } from "./behaviors/none";
import { straightBehavior } from "./behaviors/straight";
import { sineBehavior } from "./behaviors/sine";
import { invadersBehavior } from "./behaviors/invaders";
import { zigzagBehavior } from "./behaviors/zigzag";
import { loopBehavior } from "./behaviors/loop";

export const EnemyBehaviorDB: Record<EnemyBehaviorId, EnemyBehavior> = {
  none: noneBehavior,
  straight: straightBehavior,
  sine: sineBehavior,
  zigzag: zigzagBehavior,
  loop: loopBehavior,
  invaders: invadersBehavior,
};
