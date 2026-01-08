// src/game/systems/SpawnSystem.ts
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { AnyEvent, TickContext } from "../../engine/core/Loop";

import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { Vec2 } from "../../engine/math/Vec2";

import { ENEMY_DEFS, type EnemyTypeId } from "../defs/EnemyDefs";

export type WeaponId = "primary" | "secondary";

export interface SpawnSystemConfig {
  rng01: () => number;
  logicSize: { w: number; h: number };

  projectile: Record<WeaponId, { speed: number; ttlSec: number; damage: number; radius: number }>;
  bomb: { travelSec: number; damage: number; radius: number; ttlSec: number };
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
    private readonly store: EntityStore<SpawnableEntity>,
    private readonly cfg: SpawnSystemConfig,
  ) {
    if (typeof this.cfg?.rng01 !== "function") {
      throw new Error(`[SpawnSystem] cfg.rng01 must be a function`);
    }
    if (!this.cfg.logicSize || typeof this.cfg.logicSize.w !== "number" || typeof this.cfg.logicSize.h !== "number") {
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

          this.store.spawn((ent) => {
            (ent as any).kind = "projectile";
            (ent as any).owner = p.owner;
            (ent as any).weapon = p.weapon;
            (ent as any).pos = { x: p.origin.x, y: p.origin.y };
            (ent as any).vel = { x: nx * wcfg.speed, y: ny * wcfg.speed };
            (ent as any).ttl = wcfg.ttlSec;
            (ent as any).damage = wcfg.damage;
            (ent as any).radius = wcfg.radius;
            (ent as any).pendingKill = false;
            (ent as any).consumed = false;
          });
          break;
        }

        case EventType.SPAWN_BOMB: {
          const p = e.payload as CMEventMap[typeof EventType.SPAWN_BOMB];
          const b = this.cfg.bomb;

          const to = { x: p.target.x - p.origin.x, y: p.target.y - p.origin.y };
          const vx = b.travelSec > 0 ? to.x / b.travelSec : 0;
          const vy = b.travelSec > 0 ? to.y / b.travelSec : 0;

          this.store.spawn((ent) => {
            (ent as any).kind = "bomb";
            (ent as any).owner = p.owner;
            (ent as any).pos = { x: p.origin.x, y: p.origin.y };
            (ent as any).vel = { x: vx, y: vy };
            (ent as any).ttl = Math.max(0.001, b.travelSec);
            (ent as any).damage = b.damage;
            (ent as any).radius = b.radius;
            (ent as any).pendingKill = false;
            (ent as any).target = { x: p.target.x, y: p.target.y };
          });
          break;
        }

        case EventType.SPAWN_ENEMY: {
          const p = e.payload as CMEventMap[typeof EventType.SPAWN_ENEMY];

          const def = ENEMY_DEFS[p.typeId as EnemyTypeId];
          if (!def) throw new Error(`[SpawnSystem] Unknown enemy typeId: ${String(p.typeId)}`);

          const spawnPos = this.pickEdgeSpawn();
          const vel = { x: 0, y: def.speed };

          this.store.spawn((ent) => {
            (ent as any).kind = "enemy";
            (ent as any).typeId = p.typeId as EnemyTypeId;
            (ent as any).pos = spawnPos;
            (ent as any).vel = vel;
            (ent as any).hp = def.hp;
            (ent as any).radius = def.radius;
            (ent as any).pendingKill = false;
          });
          break;
        }

        case EventType.SPAWN_PICKUP:
          // MVP: ignore, nebo implementuj později
          break;

        default:
          // Director phase může mít v budoucnu další requesty => netvrdit error
          break;
      }
    }
  }

  private pickEdgeSpawn(): Vec2 {
    const w = this.cfg.logicSize.w;
    const x = this.cfg.rng01() * (w - 1);
    return { x, y: -4 };
  }
}