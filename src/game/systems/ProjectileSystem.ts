import { Phase, type EventBus } from "../../engine/core/EventBus";
import type { CMEventMap } from "../../engine/core/events";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { Vec2 } from "../../engine/math/Vec2";
import type { SpawnableEntity } from "./SpawnSystem";

export interface ProjectileBounds {
  min: Vec2; // inclusive
  max: Vec2; // inclusive
  enabled: boolean;
}

export class ProjectileSystem {
  constructor(
    private _bus: EventBus<CMEventMap>, // unused for MVP, kept for future events/telemetry
    private store: EntityStore<SpawnableEntity>,
    private bounds: ProjectileBounds,
  ) {}

  /** Must be called only in Phase.Simulation */
  update(dt: number): void {
    // drain not needed; we operate on store state
    // Optional: you can assert phase if your EventBus exposes it.
    // if (this._bus.getPhase?.() !== Phase.Simulation) throw new Error("ProjectileSystem must run in Simulation");

    this.store.debugForEachAlive((_ref, e) => {
      if (e.pendingKill) return;
      if (e.kind !== "projectile" && e.kind !== "bomb") return;

      e.pos.x += e.vel.x * dt;
      e.pos.y += e.vel.y * dt;

      e.ttl -= dt;
      if (e.ttl <= 0) {
        e.pendingKill = true;
        return;
      }

      if (this.bounds.enabled) {
        if (
          e.pos.x < this.bounds.min.x || e.pos.x > this.bounds.max.x ||
          e.pos.y < this.bounds.min.y || e.pos.y > this.bounds.max.y
        ) {
          e.pendingKill = true;
        }
      }
    });
  }
}
