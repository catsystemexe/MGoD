// src/game/systems/CleanupSystem.ts
import type { TickContext, AnyEvent } from "../../engine/core/Loop";
import type { CMEventMap } from "../../engine/core/events";
import type { EntityStore } from "../../engine/ecs/EntityStore";

export class CleanupSystem {
  constructor(private readonly store: EntityStore<any>) {}

  update(_ctx: TickContext, _events: Array<AnyEvent<CMEventMap>>): void {
    this.store.cleanup();
  }
}