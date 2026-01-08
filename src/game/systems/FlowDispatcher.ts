// FlowDispatcher.ts
import type { CMEventMap } from "../../engine/core/events";

export type AnyCMEvent = { type: keyof CMEventMap; payload: CMEventMap[keyof CMEventMap] };

export type FlowListener =
  | ((events: AnyCMEvent[]) => void)
  | { onFlowEvents: (events: AnyCMEvent[]) => void };

export class FlowDispatcher {
  private listeners: FlowListener[] = [];

  constructor(listeners?: FlowListener[]) {
    if (listeners) this.listeners = [...listeners];
  }

  addListener(l: FlowListener): void {
    this.listeners.push(l);
  }

  dispatch(events: AnyCMEvent[]): void {
    if (!events.length) return;

    for (let i = 0; i < this.listeners.length; i++) {
      const l = this.listeners[i] as any;

      if (typeof l === "function") { l(events); continue; }
      if (l && typeof l.onFlowEvents === "function") { l.onFlowEvents(events); continue; }

      const keys = l ? Object.keys(l).join(",") : "null/undefined";
      throw new Error(`[FlowDispatcher] listener[${i}] invalid. Keys=${keys}`);
    }
  }
}