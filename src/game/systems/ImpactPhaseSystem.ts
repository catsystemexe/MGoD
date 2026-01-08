// src/game/systems/ImpactPhaseSystem.ts
import type { TickContext, AnyEvent } from "../../engine/core/Loop";
import type { CMEventMap } from "../../engine/core/events";
import type { CAImpactSystem } from "../impact/CAImpactSystem";

export class ImpactPhaseSystem {
  constructor(private readonly caImpact: CAImpactSystem) {}

  update(ctx: TickContext, events: Array<AnyEvent<CMEventMap>>): void {
    this.caImpact.update(ctx, events);
  }
}