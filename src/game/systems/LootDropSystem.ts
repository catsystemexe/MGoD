import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EventBus } from "../../engine/core/EventBus";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

type AnyCMEvent = { type: keyof CMEventMap; payload: CMEventMap[keyof CMEventMap] };

type LootDropCfg = {
  dropChance: number; // 0..1
  rng01: () => number;
};

export class LootDropSystem {
  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly store: EntityStore<any>,
    private readonly cfg: LootDropCfg = { dropChance: 0.25, rng01: Math.random },
  ) {}

  onFlowEvents(events: AnyCMEvent[]): void {
    for (const e of events) {
      if (e.type !== EventType.ENTITY_KILLED) continue;

      const p = e.payload as CMEventMap[typeof EventType.ENTITY_KILLED] & { isPlayer?: boolean };
      if (p?.isPlayer) continue;

      if (this.cfg.rng01() > this.cfg.dropChance) continue;

      // try to read killed entity position BEFORE cleanup
      const targetRef = p.target as EntityRef;
      const killed: any = this.store.get(targetRef);
      if (!killed?.pos) continue;

      const pos = { x: Number(killed.pos.x ?? 0), y: Number(killed.pos.y ?? 0) };

      // simple weighted drop
      const r = this.cfg.rng01();
      const defId =
        r < 0.50 ? "energy" :
        r < 0.75 ? "score" :
        "bomb";

      this.bus.emitNext(EventType.SPAWN_PICKUP as any, { defId, pos } as any);
    }
  }
}
