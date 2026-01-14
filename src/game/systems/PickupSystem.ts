import type { EntityStore } from "../../engine/ecs/EntityStore";

export class PickupSystem {
  constructor(private readonly store: EntityStore<any>) {}

  update(dtSec: number): void {
    if (!Number.isFinite(dtSec) || dtSec <= 0) return;

    this.store.debugForEachAlive((ref, e: any) => {
      if (!e || e.kind !== "pickup") return;
      if (e.pendingKill) return;

      // posPrev snapshot for render interpolation (BEFORE movement)
      if (e.pos) {
        const pp = (e.posPrev ??= { x: e.pos.x, y: e.pos.y });
        pp.x = e.pos.x;
        pp.y = e.pos.y;
      }

      // movement (if vel present)
      if (e.pos && e.vel) {
        const vx = Number.isFinite(e.vel.x) ? e.vel.x : 0;
        const vy = Number.isFinite(e.vel.y) ? e.vel.y : 0;

        const px = Number.isFinite(e.pos.x) ? e.pos.x : 0;
        const py = Number.isFinite(e.pos.y) ? e.pos.y : 0;

        e.pos.x = px + vx * dtSec;
        e.pos.y = py + vy * dtSec;
      }

      // ttl
      const ttl0 = Number(e.ttl ?? 0);
      const ttl = Number.isFinite(ttl0) ? ttl0 : 0;
      const next = ttl - dtSec;
      e.ttl = next;

      if (next <= 0) this.store.markKill(ref);
    });
  }
}
