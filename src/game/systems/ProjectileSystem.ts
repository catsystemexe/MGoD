import type { EventBus } from "../../engine/core/EventBus";
import type { CMEventMap } from "../../engine/core/events";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { Vec2 } from "../../engine/math/Vec2";

// Minimal shape we need from your projectile entities
export interface ProjectileLike {
  kind: "projectile";
  pos: Vec2;
  vel: Vec2;
  ttl: number;
  pendingKill: boolean;
  consumed: boolean;
}

export class ProjectileSystem {
  constructor(
    private _bus: EventBus<CMEventMap>, // kept for symmetry/future (telemetry, etc.)
    private store: EntityStore<any>,
  ) {}

  /**
   * Phase.Simulation authority for projectile lifetime.
   * Rules:
   *  - If consumed => pendingKill (end of same tick, committed in Cleanup)
   *  - ttl decreases; if ttl <= 0 => pendingKill
   *  - Only updates alive && !pendingKill projectiles
   */
  update(dtSec: number): void {
    this.store.debugForEachAlive((_ref, e: ProjectileLike) => {
      if (e.kind !== "projectile") return;
      if (e.pendingKill) return;

      // Move
      // Move (in-place)
      e.pos.x += e.vel.x * dtSec;
      e.pos.y += e.vel.y * dtSec;

      // Lifetime
      e.ttl -= dtSec;

      // Deterministic kill conditions
      if (e.consumed) {
        e.pendingKill = true;
        return;
      }

      if (e.ttl <= 0) {
        e.pendingKill = true;
        return;
      }
    });
  }
}
