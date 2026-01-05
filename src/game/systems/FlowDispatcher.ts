/**
 * FlowDispatcher (CM v3.1)
 * Phase 5 (Flow):
 * - drains Flow-owned events ONCE
 * - dispatches to multiple listeners deterministically
 *
 * This prevents the "first system drains everything" problem.
 */

import type { EventBus } from "../../engine/core/EventBus";
import { Phase } from "../../engine/core/EventBus";
import type { CMEventMap } from "../../engine/core/events";

export type FlowListener = {
  onFlowEvents(events: Array<{ type: string; payload: unknown; tick: number }>): void;
};

export class FlowDispatcher {
  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly listeners: FlowListener[],
  ) {}

  update(): void {
    if (this.bus.getCurrentPhase?.() && this.bus.getCurrentPhase?.() !== Phase.Flow) {
      throw new Error("[FlowDispatcher] update() must run in Phase.Flow");
    }

    const events = this.bus.drainPhase(Phase.Flow);

    // Deterministic dispatch order: as provided in constructor
    for (const l of this.listeners) l.onFlowEvents(events);
  }
}
