/**
 * CollisionSystem (CM v3.1)
 * - Detection-only: emits *_HIT_* events, does not apply damage/grid changes.
 * - One-Hit Rule: projectile marked Consumed after first hit (collision bookkeeping).
 * - Priority: Enemy > CA when both would be hit in same tick.
 * - Player contact: emits PLAYER_HIT_ENEMY with i-frame gate (prevents event storms).
 */

import type { EventBus } from "../../core/EventBus";
import { Phase } from "../../core/EventBus";
import { EventType, type CMEventMap } from "../../core/events";
import type { EntityRef } from "../../ecs/EntityRef";
import { EntityFlag } from "../../ecs/ComponentTypes";

// Minimal data needed for collision
export type CollidableProjectile = {
  ref: EntityRef;
  alive: boolean;
  pendingKill: boolean;
  flags: number;
  x: number;
  y: number;
  r: number; // radius
};

export type CollidableEnemy = {
  ref: EntityRef;
  alive: boolean;
  pendingKill: boolean;
  x: number;
  y: number;
  r: number;
};

// Player collidable (MVP)
export type CollidablePlayer = {
  ref: EntityRef;
  alive: boolean;
  pendingKill: boolean;
  x: number;
  y: number;
  r: number;
  invulnT?: number; // seconds remaining; if >0 => ignore contact hits
};

// CA query interface (MVP)
export type CAQuery = {
  hitTestCircle: (x: number, y: number, r: number) => boolean;
};

export class CollisionSystem {
  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly ca: CAQuery,
    private readonly getProjectiles: () => CollidableProjectile[],
    private readonly getEnemies: () => CollidableEnemy[],
    private readonly getPlayer: () => CollidablePlayer | null, // ✅ NEW
  ) {}

  update(): void {
    if (this.bus.getCurrentPhase?.() && this.bus.getCurrentPhase?.() !== Phase.Collision) {
      throw new Error("[CollisionSystem] update() must run in Phase.Collision");
    }

    const projectiles = this.getProjectiles();
    const enemies = this.getEnemies();

    // --- Player contact (enemy touch)
    const player = this.getPlayer();
    if (player && player.alive && !player.pendingKill) {
      const inv = Number(player.invulnT ?? 0);

      // gate: only emit once when not invulnerable
      if (!(inv > 0)) {
        const hit = this.findEnemyHitCircle(player.x, player.y, player.r, enemies);
        if (hit) {
          this.bus.emit(EventType.PLAYER_HIT_ENEMY, {
            player: player.ref,
            enemy: hit.ref,
          } as any);
        }
      }
    }

    // --- Projectile collisions
    for (const p of projectiles) {
      if (!p.alive || p.pendingKill) continue;
      if ((p.flags & EntityFlag.Consumed) !== 0) continue;

      // 1) Enemy priority
      const hitEnemy = this.findEnemyHit(p, enemies);
      if (hitEnemy) {
        p.flags |= EntityFlag.Consumed;

        this.bus.emit(EventType.PROJECTILE_HIT_ENEMY, {
          projectile: p.ref,
          enemy: hitEnemy.ref,
        } as any);

        continue;
      }

      // 2) CA hit
      if (this.ca.hitTestCircle(p.x, p.y, p.r)) {
        p.flags |= EntityFlag.Consumed;

        this.bus.emit(EventType.PROJECTILE_HIT_CA, {
          projectile: p.ref,
          x: p.x,
          y: p.y,
        } as any);
      }
    }
  }

  private findEnemyHit(p: CollidableProjectile, enemies: CollidableEnemy[]): CollidableEnemy | null {
    for (const e of enemies) {
      if (!e.alive || e.pendingKill) continue;
      if (circleHit(p.x, p.y, p.r, e.x, e.y, e.r)) return e;
    }
    return null;
  }

  private findEnemyHitCircle(
    x: number,
    y: number,
    r: number,
    enemies: CollidableEnemy[],
  ): CollidableEnemy | null {
    for (const e of enemies) {
      if (!e.alive || e.pendingKill) continue;
      if (circleHit(x, y, r, e.x, e.y, e.r)) return e;
    }
    return null;
  }
}

function circleHit(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const rr = ar + br;
  return dx * dx + dy * dy <= rr * rr;
}