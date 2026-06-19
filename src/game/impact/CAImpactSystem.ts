// src/game/impact/CAImpactSystem.ts
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { TickContext, AnyEvent } from "../../engine/core/Loop";
import type { EventBus } from "../../engine/core/EventBus";

export type CAWorld = {
  applyExplosion: (x: number, y: number, radius: number) => number;
};

export type CAImpactRules = { explosionRadius: number };

export class CAImpactSystem {
  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly ca: CAWorld,
    private readonly rules: CAImpactRules,
  ) {}

  // ✅ PhaseRunner style: Loop předává Impact-owned events
  update(_ctx: TickContext, events: Array<AnyEvent<CMEventMap>>): void {
    let killedTotal = 0;

    for (const e of events) {
      // General AoE detonation (bomb today, more later) — carries its own radius.
      if (e.type === EventType.EXPLOSION) {
        const { x, y, radius } = e.payload as CMEventMap[typeof EventType.EXPLOSION];
        killedTotal += this.ca.applyExplosion(x, y, radius);
        continue;
      }
      if (e.type !== EventType.PROJECTILE_HIT_CA) continue;
      const { x, y } = e.payload as CMEventMap[typeof EventType.PROJECTILE_HIT_CA];
      killedTotal += this.ca.applyExplosion(x, y, this.rules.explosionRadius);
    }

    if (killedTotal > 0) {
      // owned by Flow
      this.bus.emit(EventType.CA_CELLS_KILLED, { count: killedTotal, source: "caImpact" });
    }
  }
}