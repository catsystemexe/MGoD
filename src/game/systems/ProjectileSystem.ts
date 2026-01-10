import type { EventBus } from "../../engine/core/EventBus";
import type { CMEventMap } from "../../engine/core/events";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { Vec2 } from "../../engine/math/Vec2";

// Minimal shape we need from your projectile entities
// Minimal shape we need from moving ttl entities
export interface MovingTTL {
  kind: "projectile" | "particle";
  pos: Vec2;
  vel: Vec2;
  ttl: number;
  pendingKill: boolean;

  // projectile-only
  consumed?: boolean;
}

export class ProjectileSystem {
  constructor(
    private _bus: EventBus<CMEventMap>,
    private store: EntityStore<any>,
  ) {}

  update(dtSec: number): void {
    this.store.debugForEachAlive((_ref, e: MovingTTL) => {
      if (!e) return;
      if (e.kind !== "projectile" && e.kind !== "particle") return;
      if (e.pendingKill) return;

      // Move
      if (e.pos && e.vel) {
        e.pos.x += e.vel.x * dtSec;
        e.pos.y += e.vel.y * dtSec;
      }

      // Lifetime
      e.ttl -= dtSec;

      // projectile: consumed kills same tick
      if (e.kind === "projectile") {
        if ((e as any).consumed || e.ttl <= 0) e.pendingKill = true;
      } else {
        // particle
        if (e.ttl <= 0) e.pendingKill = true;
      }
    });
  }
}