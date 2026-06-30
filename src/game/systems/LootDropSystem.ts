import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EventBus } from "../../engine/core/EventBus";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

type AnyCMEvent = { type: keyof CMEventMap; payload: CMEventMap[keyof CMEventMap] };

export type PickupDefId = "energy" | "bomb" | "score" | "w1" | "w2";

type LootDropCfg = {
  dropChance: number; // 0..1
  rng01: () => number;
};

const PICKUP_DROP_WEIGHTS: ReadonlyArray<{ defId: PickupDefId; weight: number }> = [
  { defId: "energy", weight: 35 },
  { defId: "bomb", weight: 15 },
  { defId: "score", weight: 20 },
  { defId: "w1", weight: 15 },
  { defId: "w2", weight: 15 },
];

export function selectPickupDefId(rng01: () => number): PickupDefId {
  const total = PICKUP_DROP_WEIGHTS.reduce((sum, item) => sum + item.weight, 0);
  const raw = Number(rng01());
  const r01 = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  let threshold = r01 * total;

  for (const item of PICKUP_DROP_WEIGHTS) {
    threshold -= item.weight;
    if (threshold < 0) return item.defId;
  }

  return PICKUP_DROP_WEIGHTS[PICKUP_DROP_WEIGHTS.length - 1].defId;
}

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

      const defId = selectPickupDefId(this.cfg.rng01);
      this.bus.emitNext(EventType.SPAWN_PICKUP, { defId, pos });

    }
  }
}
