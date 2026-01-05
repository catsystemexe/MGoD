import { Phase, type EventBus } from "../../engine/core/EventBus";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { Vec2 } from "../../engine/math/Vec2";

export type WeaponId = "primary" | "secondary";

export interface SpawnSystemConfig {
  projectile: Record<WeaponId, {
    speed: number;      // WU/sec
    ttlSec: number;
    damage: number;
    radius: number;     // WU
  }>;
  bomb: {
    travelSec: number;  // time to reach target
    damage: number;
    radius: number;
    ttlSec: number;     // after landing/explosion (MVP can just be travelSec)
  };
}

export interface ProjectileEntity {
  kind: "projectile";
  owner: EntityRef;
  weapon: WeaponId;
  pos: Vec2;
  vel: Vec2;
  ttl: number;
  damage: number;
  radius: number;
  pendingKill: boolean;
}

export interface BombEntity {
  kind: "bomb";
  owner: EntityRef;
  pos: Vec2;
  vel: Vec2;
  ttl: number;
  damage: number;
  radius: number;
  pendingKill: boolean;
  target: Vec2;
}

export type SpawnableEntity = ProjectileEntity | BombEntity;

export class SpawnSystem {
  constructor(
    private bus: EventBus<CMEventMap>,
    private store: EntityStore<SpawnableEntity>,
    private cfg: SpawnSystemConfig,
  ) {}

  /** Must be called only when bus is in Phase.Director */
  update(): void {
    // Optional guard if your EventBus exposes current phase
    // (If not, ignore; ownership map still protects correctness.)
    // if (this.bus.getPhase?.() !== Phase.Director) throw new Error("SpawnSystem.update must run in Director");

    const events = this.bus.drainPhase(Phase.Director);

    for (const e of events) {
      switch (e.type) {
        case EventType.SPAWN_PROJECTILE: {
          const p = e.payload;
          const weapon = p.weapon;
          const wcfg = this.cfg.projectile[weapon];

          // normalize dir defensively
          const dx = p.dir.x;
          const dy = p.dir.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = dx / len;
          const ny = dy / len;

          const vx = nx * wcfg.speed;
          const vy = ny * wcfg.speed;

          this.store.spawn(ent => {
            ent.kind = "projectile";
            ent.owner = p.owner;
            ent.weapon = weapon;
            ent.pos = { x: p.origin.x, y: p.origin.y };
            ent.vel = { x: vx, y: vy };
            ent.ttl = wcfg.ttlSec;
            ent.damage = wcfg.damage;
            ent.radius = wcfg.radius;
            ent.pendingKill = false;
          });

          break;
        }

        case EventType.SPAWN_BOMB: {
          const p = e.payload;
          const b = this.cfg.bomb;

          // MVP: bomb is a moving entity toward target with fixed travel time
          // vel computed so it reaches target in travelSec
          // (Later: arc, easing, shadow, etc.)
          // For now origin = ship position is not provided in payload; caller should set it.
          // If you want "drop at cursor" with teleport: set pos = target and ttl = 0.
          // We'll assume origin is implicit: use target as spawn pos if no origin exists.
          const origin = { x: p.target.x, y: p.target.y }; // fallback behavior
          const to = { x: p.target.x - origin.x, y: p.target.y - origin.y };
          const vx = b.travelSec > 0 ? (to.x / b.travelSec) : 0;
          const vy = b.travelSec > 0 ? (to.y / b.travelSec) : 0;

          this.store.spawn(ent => {
            ent.kind = "bomb";
            ent.owner = p.owner;
            ent.pos = { x: origin.x, y: origin.y };
            ent.vel = { x: vx, y: vy };
            ent.ttl = Math.max(0.001, b.travelSec); // MVP
            ent.damage = b.damage;
            ent.radius = b.radius;
            ent.pendingKill = false;
            ent.target = { x: p.target.x, y: p.target.y };
          });

          break;
        }

        default:
          // If ownership map is correct, SpawnSystem should never see other event types here.
          throw new Error(`[SpawnSystem] Unexpected event in Director drain: ${String(e.type)}`);
      }
    }
  }
}
