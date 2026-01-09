// src/game/systems/EnemySystem.ts
import type { EntityStore } from "../../engine/ecs/EntityStore";

type Vec2 = { x: number; y: number };

export interface EnemyLike {
  kind: "enemy";
  pos: Vec2;
  vel: Vec2;
  radius?: number;
  pendingKill: boolean;
}

export class EnemySystem {
  constructor(
    private readonly store: EntityStore<any>,
    private readonly logicW: number,
    private readonly logicH: number,
  ) {}

  /** Phase.Simulation: move enemies + cull offscreen */
  update(dtSec: number): void {
    const H = this.logicH;

    this.store.debugForEachAlive((ref, e: EnemyLike) => {
      if (!e || e.kind !== "enemy") return;
      if (e.pendingKill) return;

      // move
      if (e.pos && e.vel) {
        e.pos.x += (e.vel.x ?? 0) * dtSec;
        e.pos.y += (e.vel.y ?? 0) * dtSec;
      }

      // offscreen cull (below screen)
      const r = typeof e.radius === "number" ? e.radius : 4;
      if ((e.pos?.y ?? 0) > H + r + 8) {
        this.store.markKill(ref);
      }
    });
  }
}