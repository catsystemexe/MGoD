/**
 * SpawnSystem (CM v3.1)
 * - ONLY place that turns SPAWN_* events into real entities.
 * - Must be run in Phase.Director (Phase 1).
 */

import type { EventBus } from "../core/EventBus";
import { Phase } from "../core/EventBus";
import { EventType, type CMEventMap } from "../core/events";
import type { EntityRef } from "../ecs/EntityRef";
import type { BaseEntity } from "../ecs/ComponentTypes";
import { EntityStore } from "../ecs/EntityStore";

export interface SpawnEnemyPayload {
  defId: string;
  x: number;
  y: number;
}

export interface SpawnProjectilePayload {
  defId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner?: EntityRef; // shooter
}

export interface SpawnPickupPayload {
  defId: string;
  x: number;
  y: number;
}

export type SpawnFactory<T extends BaseEntity> = {
  spawnEnemy: (store: EntityStore<T>, p: SpawnEnemyPayload) => EntityRef;
  spawnProjectile: (store: EntityStore<T>, p: SpawnProjectilePayload) => EntityRef;
  spawnPickup: (store: EntityStore<T>, p: SpawnPickupPayload) => EntityRef;
};

export class SpawnSystem<T extends BaseEntity> {
  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly store: EntityStore<T>,
    private readonly factory: SpawnFactory<T>,
  ) {}


  export interface PickupEntity extends BaseEntity {
    kind: "pickup";
    defId: string;
    pos: Vec2;
    vel: Vec2;
    radius: number;
    ttl: number;
  }
  /**
   * Must be invoked during Phase.Director.
   * Drains spawn events owned by Phase.Director and spawns entities immediately.
   */
  update(): void {
    // Optional guard (dev only): enforce phase
    if (this.bus.getCurrentPhase?.() && this.bus.getCurrentPhase?.() !== Phase.Director) {
      throw new Error("[SpawnSystem] update() must run in Phase.Director");
    }

    // Ownership map assigns SPAWN_* to Phase.Director, so drainPhase(Director) yields them.
    const spawnEvents = this.bus.drainPhase(Phase.Director);

    for (const e of spawnEvents) {
      switch (e.type) {
        case EventType.SPAWN_ENEMY:
          this.factory.spawnEnemy(this.store, e.payload as SpawnEnemyPayload);
          break;

        case EventType.SPAWN_PROJECTILE:
        
          
          console.log("SPAWN tick", (window as any).__CM?.loop?.getTick?.(), p.dir);
          
          this.factory.spawnProjectile(this.store, e.payload as SpawnProjectilePayload);
          break;

        case EventType.SPAWN_PICKUP:
          this.factory.spawnPickup(this.store, e.payload as SpawnPickupPayload);
          break;

        default:
          // In strict mode, any unexpected event here is a contract violation
          throw new Error(`[SpawnSystem] Unexpected event in Director drain: ${String(e.type)}`);
      }
    }
  }
}
