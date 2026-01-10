import type { EntityStore } from "../../engine/ecs/EntityStore";

export class PickupSystem {
  constructor(private readonly store: EntityStore<any>) {}

  update(dtSec: number): void {
    if (!Number.isFinite(dtSec) || dtSec <= 0) return;

    this.store.debugForEachAlive((ref, e: any) => {
      if (!e || e.kind !== "pickup") return;
      if (e.pendingKill) return;

      const ttl0 = Number(e.ttl ?? 0);
      const ttl = Number.isFinite(ttl0) ? ttl0 : 0;

      const next = ttl - dtSec;
      e.ttl = next;

      if (next <= 0) this.store.markKill(ref);
    });
  }
}
