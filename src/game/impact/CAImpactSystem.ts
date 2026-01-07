// src/game/impact/CAImpactSystem.ts

/**
 * CAImpactSystem (CM v3.1)
 * Phase.Impact:
 * - drains Phase.Impact hit events that involve CA
 * - applies CA operators
 * - batches into ONE CA_CELLS_KILLED event per tick
 */

import type { EventBus } from "../../engine/core/EventBus";
import { Phase } from "../../engine/core/EventBus";
import { EventType, type CMEventMap } from "../../engine/core/events";

export type CAWorld = {
  /**
   * Apply an explosion-like operator at (x,y).
   * Returns number of killed cells.
   */
  applyExplosion: (x: number, y: number, radius: number) => number;
};

export type CAImpactRules = {
  explosionRadius: number; // MVP fixed
};

export class CAImpactSystem {
  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly ca: CAWorld,
    private readonly rules: CAImpactRules,
  ) {}

  update(): void {
    // optional runtime safety
    if (this.bus.getCurrentPhase?.() && this.bus.getCurrentPhase?.() !== Phase.Impact) {
      throw new Error("[CAImpactSystem] update() must run in Phase.Impact");
    }

    const events = this.bus.drainPhase(Phase.Impact);

    let killedTotal = 0;

    for (const e of events) {
      if (e.type !== EventType.PROJECTILE_HIT_CA) continue;

      const { x, y } = e.payload as CMEventMap[typeof EventType.PROJECTILE_HIT_CA];

      killedTotal += this.ca.applyExplosion(x, y, this.rules.explosionRadius);
    }

    if (killedTotal > 0) {
      // Owned by Flow (podle tvého OwnershipMap)
      this.bus.emit(EventType.CA_CELLS_KILLED, {
        count: killedTotal,
        source: "caImpact",
      });
    }
  }
}