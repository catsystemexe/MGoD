/**
 * CAImpactSystem (CM v3.1)
 * Phase 4 (Impact):
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
  explosionRadius: number; // MVP fixed; later based on projectile defId
};

export class CAImpactSystem {
  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly ca: CAWorld,
    private readonly rules: CAImpactRules,
  ) {}

  update(): void {
    if (this.bus.getCurrentPhase?.() && this.bus.getCurrentPhase?.() !== Phase.Impact) {
      throw new Error("[CAImpactSystem] update() must run in Phase.Impact");
    }

    const events = this.bus.drainPhase(Phase.Impact);

    let killedTotal = 0;

    for (const e of events) {
      if (e.type !== EventType.PROJECTILE_HIT_CA) continue;

      const { x, y } = e.payload as { projectile: any; x: number; y: number };

      // MVP: explosion operator
      const killed = this.ca.applyExplosion(x, y, this.rules.explosionRadius);
      killedTotal += killed;
    }

    // Batch output
    if (killedTotal > 0) {
      this.bus.emit(EventType.CA_CELLS_KILLED, {
        count: killedTotal,
        source: "caImpact",
      });
    }
  }
}
