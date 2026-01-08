// src/game/systems/SpawnSystem.ts
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { AnyEvent, TickContext } from "../../engine/core/Loop";

import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { BaseEntity } from "../../engine/ecs/ComponentTypes";

import { ENEMY_DEFS, type EnemyTypeId } from "../defs/EnemyDefs";

type Vec2 = { x: number; y: number };

export type WeaponId = "primary" | "secondary";

export interface SpawnSystemConfig {
  rng01: () => number;
  logicSize: { w: number; h: number };

  projectile: Record<WeaponId, { speed: number; ttlSec: number; damage: number; radius: number }>;
  bomb: { travelSec: number; damage: number; radius: number; ttlSec: number };
}

export interface ProjectileEntity extends BaseEntity {
  kind: "projectile";
  owner: EntityRef;
  weapon: WeaponId;
  pos: Vec2;
  vel: Vec2;
  ttl: number;
  damage: number;
  radius: number;
  consumed: boolean;
}

export interface BombEntity extends BaseEntity {
  kind: "bomb";
  owner: EntityRef;
  pos: Vec2;
  vel: Vec2;
  ttl: number;
  damage: number;
  radius: number;
  target: Vec2;
}

export interface EnemyEntity extends BaseEntity {
  kind: "enemy";
  typeId: EnemyTypeId;
  pos: Vec2;
  vel: Vec2;
  hp: number;
  radius: number;
}

export type SpawnableEntity = ProjectileEntity | BombEntity | EnemyEntity;

export class SpawnSystem {
  constructor(
    private readonly store: EntityStore<SpawnableEntity>,
    private readonly cfg: SpawnSystemConfig,
  ) {
    if (typeof this.cfg?.rng01 !== "function") {
      throw new Error(`[SpawnSystem] cfg.rng01 must be a function`);
    }
    if (
      !this.cfg.logicSize ||
      typeof this.cfg.logicSize.w !== "number" ||
      typeof this.cfg.logicSize.h !== "number"
    ) {
      throw new Error(`[SpawnSystem] cfg.logicSize must be {w:number,h:number}`);
    }
  }

  /** Phase.Director handler (Loop provides events) */
  update(_ctx: TickContext, events: Array<AnyEvent<CMEventMap>>): void {
    for (const e of events) {
      switch (e.type) {
        case EventType.SPAWN_PROJECTILE: {
          const p = e.payload as CMEventMap[typeof EventType.SPAWN_PROJECTILE];
          const wcfg = this.cfg.projectile[p.weapon];

          const dx = p.dir.x;
          const dy = p.dir.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = dx / len;
          const ny = dy / len;

          this.store.spawn((ent: any) => {
            ent.kind = "projectile";
            ent.owner = p.owner;
            ent.weapon = p.weapon;
            ent.pos = { x: p.origin.x, y: p.origin.y };
            ent.vel = { x: nx * wcfg.speed, y: ny * wcfg.speed };
            ent.ttl = wcfg.ttlSec;
            ent.damage = wcfg.damage;
            ent.radius = wcfg.radius;
            ent.consumed = false;
            ent.pendingKill = false; // BaseEntity má pendingKill v runtime shape (EntityStore ho používá)
          });
          break;
        }

        case EventType.SPAWN_BOMB: {
          const p = e.payload as CMEventMap[typeof EventType.SPAWN_BOMB];
          const b = this.cfg.bomb;

          const to = { x: p.target.x - p.origin.x, y: p.target.y - p.origin.y };
          const vx = b.travelSec > 0 ? to.x / b.travelSec : 0;
          const vy = b.travelSec > 0 ? to.y / b.travelSec : 0;

          this.store.spawn((ent: any) => {
            ent.kind = "bomb";
            ent.owner = p.owner;
            ent.pos = { x: p.origin.x, y: p.origin.y };
            ent.vel = { x: vx, y: vy };
            ent.ttl = Math.max(0.001, b.travelSec);
            ent.damage = b.damage;
            ent.radius = b.radius;
            ent.target = { x: p.target.x, y: p.target.y };
            ent.pendingKill = false;
          });
          break;
        }

        case EventType.SPAWN_ENEMY: {
          const p = e.payload as CMEventMap[typeof EventType.SPAWN_ENEMY];

          const def = ENEMY_DEFS[p.typeId as EnemyTypeId];
          if (!def) throw new Error(`[SpawnSystem] Unknown enemy typeId: ${String(p.typeId)}`);

          const spawnPos = this.pickEdgeSpawn(def.radius ?? 4);
          const vel = { x: 0, y: def.speed };

          this.store.spawn((ent: any) => {
            ent.kind = "enemy";
            ent.typeId = p.typeId as EnemyTypeId;
            ent.pos = spawnPos;
            ent.vel = vel;
            ent.hp = def.hp;
            ent.radius = def.radius;
            ent.pendingKill = false;
          });
          break;
        }

        case EventType.SPAWN_PICKUP:
          // MVP: ignore
          break;

        default:
          break;
      }
    }
  }

  private pickEdgeSpawn(radius: number): Vec2 {
    const w = this.cfg.logicSize.w;
    const x = this.cfg.rng01() * (w - 1);
    // spawn těsně nad obrazem, podle radiusu
    return { x, y: -(Math.max(1, radius) + 1) };
  }
}