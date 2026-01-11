// src/game/systems/ImpactPhaseSystem.ts
import type { TickContext, AnyEvent } from "../../engine/core/Loop";
import type { CMEventMap } from "../../engine/core/events";
import type { CAImpactSystem } from "../impact/CAImpactSystem";
import { DamageSystem } from "./DamageSystem";
import type { WorldEntity } from "./CollisionSystem";

export class ImpactPhaseSystem {
  constructor(
    private readonly damage: DamageSystem,
    private readonly caImpact: CAImpactSystem
  ) {}

  update(ctx: TickContext, events: Array<AnyEvent<CMEventMap>>): void {
    // Loop already drained Phase.Impact; pass events to avoid double-drain.
    this.damage.update(events as any);
    this.caImpact.update(ctx, events);
  }
}
