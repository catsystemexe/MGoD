import type { EventBus } from "../../engine/core/EventBus";
import type { CMEventMap } from "../../engine/core/events";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { WorldState } from "../data/WorldState";

type Vec2 = { x: number; y: number };

// Minimal shape we need from moving ttl entities
export interface MovingTTL {
  kind: "projectile" | "particle" | "bomb" | "fx";
  pos: Vec2;
  vel: Vec2;
  ttl: number;
  pendingKill: boolean;

  // projectile-only
  consumed?: boolean;

  // optional radius (bombs often have it)
  radius?: number;

  // render interpolation
  posPrev?: Vec2;
}

function safeNum(v: any, fb: number): number {
  const n = typeof v === "number" ? v : fb;
  return Number.isFinite(n) ? n : fb;
}

export class ProjectileSystem {
  constructor(
    private _bus: EventBus<CMEventMap>,
    private store: EntityStore<any>,
    private readonly logicW: number,
    private readonly logicH: number,
    private readonly world: WorldState,
  ) {}

  update(dtSec: number): void {
    if (!Number.isFinite(dtSec) || dtSec <= 0) return;

    const W = this.logicW;
    const H = this.logicH;

    const camX = safeNum(this.world?.scrollX, 0);
    const camY = safeNum(this.world?.scrollY, 0);
    const band = 140;   // slightly looser than enemies (shots can travel)

    // X band tolerance (world-space, around camera)
    const xMargin = 24;

    this.store.debugForEachAlive((_ref, e: MovingTTL) => {
      if (!e) return;
      if (e.kind !== "projectile" && e.kind !== "particle" && e.kind !== "bomb" && e.kind !== "fx") return;
      if (e.pendingKill) return;

      // posPrev snapshot for render interpolation (BEFORE movement)
      const a: any = e as any;
      if (!a.posPrev) a.posPrev = { x: e.pos.x, y: e.pos.y };
      else { a.posPrev.x = e.pos.x; a.posPrev.y = e.pos.y; }

      // Move
      if (e.pos && e.vel) {
        e.pos.x += e.vel.x * dtSec;
        e.pos.y += e.vel.y * dtSec;
      }

      // Lifetime
      e.ttl -= dtSec;

      // TTL kill conditions
      if (e.kind === "projectile") {
        if ((e as any).consumed || e.ttl <= 0) e.pendingKill = true;
      } else {
        // particle OR bomb OR fx
        if (e.ttl <= 0) e.pendingKill = true;
      }
      if (e.pendingKill) return;

      // A+ CULL (projectile + bomb only)
      if (e.kind === "projectile" || e.kind === "bomb") {
        const r = safeNum((e as any).radius, e.kind === "bomb" ? 6 : 1);

        // world-space X band around camera
        if (e.pos.x < camX - r - xMargin) { e.pendingKill = true; return; }
        if (e.pos.x > camX + W + r + xMargin) { e.pendingKill = true; return; }

        // world-space Y band around camera
        if (e.pos.y < camY - r - band) { e.pendingKill = true; return; }
        if (e.pos.y > camY + H + r + band) { e.pendingKill = true; return; }
      }
    });
  }
}
