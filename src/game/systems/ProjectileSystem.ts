import type { EventBus } from "../../engine/core/EventBus";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { WorldState } from "../data/WorldState";

// Bomb detonates when it arrives within this many px of its target (primary trigger).
const ARRIVE_EPS = 4;

type Vec2 = { x: number; y: number };

// Minimal shape we need from moving ttl entities
export interface MovingTTL {
  kind: "projectile" | "particle" | "bomb" | "fx" | "enemyProjectile";
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

  // render-only FX local ages
  fxAge?: number;
  deathVisual?: { age?: number };
}

function safeNum(v: any, fb: number): number {
  const n = typeof v === "number" ? v : fb;
  return Number.isFinite(n) ? n : fb;
}

export class ProjectileSystem {
  constructor(
    private bus: EventBus<CMEventMap>,
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
      if (e.kind !== "projectile" && e.kind !== "particle" && e.kind !== "bomb" && e.kind !== "fx" && e.kind !== "enemyProjectile") return;
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

      // Render-only FX local ages (TTL remains authoritative for cleanup)
      if (e.kind === "fx") {
        const fxAge = Number((e as any).fxAge ?? 0);
        (e as any).fxAge = (Number.isFinite(fxAge) && fxAge >= 0 ? fxAge : 0) + dtSec;

        if ((e as any).deathVisual) {
          const age = Number((e as any).deathVisual.age ?? 0);
          (e as any).deathVisual.age = (Number.isFinite(age) && age >= 0 ? age : 0) + dtSec;
        }
      }

      // Lifetime
      e.ttl -= dtSec;

      // BOMB detonation: proximity to target (primary) or TTL expiry (fallback).
      // Emits a general EXPLOSION (Impact-owned) consumed by DamageSystem (AoE on
      // enemies) and CAImpactSystem (terrain). Detected here because detonation is a
      // movement/lifetime event of the bomb entity.
      if (e.kind === "bomb") {
        const b: any = e;
        const tx = Number(b.target?.x ?? b.pos.x);
        const ty = Number(b.target?.y ?? b.pos.y);
        const ddx = b.pos.x - tx;
        const ddy = b.pos.y - ty;
        const reachedTarget = (ddx * ddx + ddy * ddy) <= (ARRIVE_EPS * ARRIVE_EPS);
        const expired = e.ttl <= 0;

        if (reachedTarget || expired) {
          this.bus.emit(EventType.EXPLOSION, {
            x: b.pos.x,
            y: b.pos.y,
            radius: Number(b.explosionRadius ?? b.radius ?? 1),
            damage: Number(b.damage ?? 0),
            source: reachedTarget ? "bomb" : "bomb.ttl",
          });
          e.pendingKill = true;
        }
        if (e.pendingKill) return;
        // still flying -> skip generic TTL-kill, fall through to A+ cull
      }

      // TTL kill conditions
      if (e.kind === "projectile" || e.kind === "enemyProjectile") {
        if ((e as any).consumed || e.ttl <= 0) e.pendingKill = true;
      } else if (e.kind !== "bomb") {
        // particle OR fx (bomb handled above)
        if (e.ttl <= 0) e.pendingKill = true;
      }
      if (e.pendingKill) return;

      // A+ CULL (projectile + bomb + enemyProjectile)
      if (e.kind === "projectile" || e.kind === "bomb" || e.kind === "enemyProjectile") {
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
