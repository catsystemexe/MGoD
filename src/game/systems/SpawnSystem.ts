/**
 * Game SpawnSystem (CM v3.1)
 * - ONLY place that turns SPAWN_* events into real entities (game-layer entities).
 * - Must be run in Phase.Director.
 */

import { Phase, type EventBus } from "../../engine/core/EventBus";
import { EventType, type CMEventMap } from "../../engine/core/events";

import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { Vec2 } from "../../engine/math/Vec2";

import { ENEMY_DEFS, type EnemyTypeId } from "../defs/EnemyDefs";

export type WeaponId = "primary" | "secondary";

export interface SpawnSystemConfig {
  rng01: () => number; // deterministic 0..1
  logicSize: { w: number; h: number };

  projectile: Record<
    WeaponId,
    {
      speed: number;
      ttlSec: number;
      damage: number;
      radius: number;
    }
  >;

  bomb: {
    travelSec: number;
    damage: number;
    radius: number;
    ttlSec: number;
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
  consumed: boolean;
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

export interface EnemyEntity {
  kind: "enemy";
  typeId: EnemyTypeId;
  pos: Vec2;
  vel: Vec2;
  hp: number;
  radius: number;
  pendingKill: boolean;
}

export type SpawnableEntity = ProjectileEntity | BombEntity | EnemyEntity;

export class SpawnSystem {
  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly store: EntityStore<SpawnableEntity>,
    private readonly cfg: SpawnSystemConfig,
  ) {
    // Fail-fast (reálně ti šetří čas)
    if (typeof this.cfg?.rng01 !== "function") {
      throw new Error(
        `[SpawnSystem] cfg.rng01 must be a function. Got ${typeof (this.cfg as any)?.rng01}. Keys=${Object.keys(
          (this.cfg ?? {}) as any,
        ).join(",")}`,
      );
    }
    if (!this.cfg.logicSize || typeof this.cfg.logicSize.w !== "number" || typeof this.cfg.logicSize.h !== "number") {
      throw new Error(`[SpawnSystem] cfg.logicSize must be {w:number,h:number}. Got=${JSON.stringify(this.cfg.logicSize)}`);
    }
  }

  /** Must be called only when bus is in Phase.Director */
  update(): void {
    const events = this.bus.drainPhase(Phase.Director);

    for (const e of events) {
      switch (e.type) {
        case EventType.SPAWN_PROJECTILE: {
          const p = e.payload as CMEventMap[typeof EventType.SPAWN_PROJECTILE];

          const weapon = p.weapon;
          const wcfg = this.cfg.projectile[weapon];

          const dx = p.dir.x;
          const dy = p.dir.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = dx / len;
          const ny = dy / len;

          const vx = nx * wcfg.speed;
          const vy = ny * wcfg.speed;

          this.store.spawn((ent) => {
            ent.kind = "projectile";
            ent.owner = p.owner;
            ent.weapon = weapon;
            ent.pos = { x: p.origin.x, y: p.origin.y };
            ent.vel = { x: vx, y: vy };
            ent.ttl = wcfg.ttlSec;
            ent.damage = wcfg.damage;
            ent.radius = wcfg.radius;
            ent.pendingKill = false;
            ent.consumed = false;
          });

          break;
        }

          case EventType.SPAWN_BOMB: {
            const p = e.payload as CMEventMap[typeof EventType.SPAWN_BOMB];
            const b = this.cfg.bomb;

            // ✅ origin může chybět -> fallback (MVP: spawn na origin=target)
            const origin = p.origin ?? { x: p.target.x, y: p.target.y };

            const to = { x: p.target.x - origin.x, y: p.target.y - origin.y };
            const vx = b.travelSec > 0 ? to.x / b.travelSec : 0;
            const vy = b.travelSec > 0 ? to.y / b.travelSec : 0;

            this.store.spawn((ent) => {
              ent.kind = "bomb";
              ent.owner = p.owner;
              ent.pos = { x: origin.x, y: origin.y };
              ent.vel = { x: vx, y: vy };
              ent.ttl = Math.max(0.001, b.travelSec);
              ent.damage = b.damage;
              ent.radius = b.radius;
              ent.pendingKill = false;
              ent.target = { x: p.target.x, y: p.target.y };
            });

            break;
          }

        case EventType.SPAWN_ENEMY: {
          const p = e.payload as CMEventMap[typeof EventType.SPAWN_ENEMY];

          const def = ENEMY_DEFS[p.typeId];
          if (!def) throw new Error(`[SpawnSystem] Unknown enemy typeId: ${String(p.typeId)}`);

          const spawnPos = this.pickEdgeSpawn();
          const vel = { x: 0, y: def.speed }; // MVP drift down

          this.store.spawn((ent) => {
            ent.kind = "enemy";
            ent.typeId = p.typeId;
            ent.pos = spawnPos;
            ent.vel = vel;
            ent.hp = def.hp;
            ent.radius = def.radius;
            ent.pendingKill = false;
          });

          break;
        }

        default:
          throw new Error(`[SpawnSystem] Unexpected event in Director drain: ${String(e.type)}`);
      }
    }
  }

  private pickEdgeSpawn(): Vec2 {
    const w = this.cfg.logicSize.w;
    const x = this.cfg.rng01() * (w - 1);
    return { x, y: -4 };
  }
}