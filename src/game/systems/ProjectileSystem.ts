import type { EventBus } from "../../engine/core/EventBus";
import type { CMEventMap } from "../../engine/core/events";
import type { EntityStore } from "../../engine/ecs/EntityStore";

type Vec2 = { x: number; y: number };

// Minimal shape we need from moving ttl entities
export interface MovingTTL {
  kind: "projectile" | "particle" | "bomb" | "fx";
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
    if (!Number.isFinite(dtSec) || dtSec <= 0) return;

    this.store.debugForEachAlive((_ref, e: MovingTTL) => {
      if (!e) return;
      if (e.kind !== "projectile" && e.kind !== "particle" && e.kind !== "bomb" && e.kind !== "fx") return;
      if (e.pendingKill) return;

      // posPrev snapshot for render interpolation (BEFORE movement)
      const a: any = e as any;
      if (!a.posPrev) a.posPrev = { x: e.pos.x, y: e.pos.y };
      else { a.posPrev.x = e.pos.x; a.posPrev.y = e.pos.y; }

      // Move
      if (e.pos && e.vel) {
        e.pos.x += e.vel.x * dtSec;
        e.pos.y += e.vel.y * dtSec;
      }

      // Lifetime
      e.ttl -= dtSec;

      // Kill conditions
      if (e.kind === "projectile") {
        if ((e as any).consumed || e.ttl <= 0) e.pendingKill = true;
      } else {
        // particle OR bomb OR fx
        if (e.ttl <= 0) e.pendingKill = true;
      }
    });
  }
}
