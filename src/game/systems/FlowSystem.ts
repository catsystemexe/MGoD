// src/game/systems/FlowSystem.ts
import type { TickContext, AnyEvent } from "../../engine/core/Loop";
import type { CMEventMap } from "../../engine/core/events";
import { FlowDispatcher } from "./FlowDispatcher";

export class FlowSystem {
  constructor(private readonly flow: FlowDispatcher) {}

  update(_ctx: TickContext, events: Array<AnyEvent<CMEventMap>>): void {
    this.flow.dispatch(events as any);
  }
}