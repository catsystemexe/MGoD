// src/game/systems/FlowDispatcher.ts
import type { EventBus } from "../../engine/core/EventBus";
import { Phase } from "../../engine/core/EventBus";
import type { CMEventMap } from "../../engine/core/events";

export type AnyCMEvent = { type: keyof CMEventMap; payload: CMEventMap[keyof CMEventMap] };

// Listener může být buď funkce, nebo objekt s metodou
export type FlowListener =
  | ((events: AnyCMEvent[]) => void)
  | { onFlowEvents: (events: AnyCMEvent[]) => void };

export class FlowDispatcher {
  private listeners: FlowListener[] = [];

  constructor(
    private readonly bus: EventBus<CMEventMap>,
    listeners?: FlowListener[],
  ) {
    if (listeners) this.listeners = [...listeners];
  }

  addListener(l: FlowListener): void {
    this.listeners.push(l);
  }

  update(): void {
    if (this.bus.getCurrentPhase?.() && this.bus.getCurrentPhase?.() !== Phase.Flow) {
      throw new Error("[FlowDispatcher] update() must run in Phase.Flow");
    }

    const events = this.bus.drainPhase(Phase.Flow) as AnyCMEvent[];
    if (events.length === 0) return;

    for (let i = 0; i < this.listeners.length; i++) {
      const l = this.listeners[i] as any;

      if (typeof l === "function") {
        l(events);
        continue;
      }

      if (l && typeof l.onFlowEvents === "function") {
        l.onFlowEvents(events);
        continue;
      }

      // fail-fast s diagnostikou
      const keys = l ? Object.keys(l).join(",") : "null/undefined";
      throw new Error(`[FlowDispatcher] listener[${i}] has no onFlowEvents() and is not a function. Keys=${keys}`);
    }
  }
}