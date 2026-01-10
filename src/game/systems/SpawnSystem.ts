// src/game/systems/SpawnSystem.ts
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { AnyEvent, TickContext } from "../../engine/core/Loop";

import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { BaseEntity } from "../../engine/ecs/ComponentTypes";

import type { EnemyBehaviorId, EnemyBehaviorParams, EnemyBehaviorRuntime } from "../enemies/EnemyBehaviorTypes";
import { EnemyBehaviorDB } from "../enemies/EnemyBehaviorDB";
import { EnemyBehaviorPresets, type EnemyBehaviorPresetId } from "../enemies/EnemyBehaviorPresets";

import { ENEMY_DEFS, type EnemyTypeId } from "../defs/EnemyDefs";

type Vec2 = { x: number; y: number };

export type WeaponId = "primary" | "secondary";

export interface SpawnSystemConfig {
  rng01: () => number;
  logicSize: { w: number; h: number };

  projectile: Record<WeaponId, { speed: number; ttlSec: number; damage: number; radius: number }>;
  bomb: { travelSec: number; damage: number; radius: number; ttlSec: number };
  pickup?: { ttlSec: number; radius: number; fallSpeed: number };
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

export interface PickupEntity extends BaseEntity {
  kind: "pickup";
  defId: string;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  ttl: number;
}

export interface EnemyEntity extends BaseEntity {
  kind: "enemy";
  typeId: EnemyTypeId;
  pos: Vec2;
  vel: Vec2;
  hp: number;
  radius: number;

  behaviorId: EnemyBehaviorId;
  behavior: EnemyBehaviorParams;
  bState: EnemyBehaviorRuntime;
}

export type SpawnableEntity = ProjectileEntity | BombEntity | PickupEntity | EnemyEntity;

export class SpawnSystem {
  constructor(
    private readonly store: EntityStore<SpawnableEntity>,
    private readonly cfg: SpawnSystemConfig,
  ) {
    if (typeof this.cfg?.rng01 !== "function") throw new Error(`[SpawnSystem] cfg.rng01 must be a function`);
    if (!this.cfg.logicSize || typeof this.cfg.logicSize.w !== "number" || typeof this.cfg.logicSize.h !== "number") {
      throw new Error(`[SpawnSystem] cfg.logicSize must be {w:number,h:number}`);
    }
    if (!this.cfg.projectile || !this.cfg.bomb) throw new Error(`[SpawnSystem] cfg.projectile and cfg.bomb must be defined`);
  }

  update(_ctx: TickContext, events: Array<AnyEvent<CMEventMap>>): void {
    for (const e of events) {
      switch (e.type) {
        case EventType.SPAWN_PROJECTILE: {
          const p = e.payload as CMEventMap[typeof EventType.SPAWN_PROJECTILE];
          const wcfg = this.cfg.projectile[p.weapon];
          if (!wcfg) break;

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
            ent.ttl = Math.max(0.001, wcfg.ttlSec);
            ent.damage = wcfg.damage;
            ent.radius = wcfg.radius;
            ent.consumed = false;
            ent.pendingKill = false;
          });
          break;
        }

        case EventType.SPAWN_BOMB: {
          const p = e.payload as CMEventMap[typeof EventType.SPAWN_BOMB];
          const b = this.cfg.bomb;

          const to = { x: p.target.x - p.origin.x, y: p.target.y - p.origin.y };
          const travel = Math.max(0.001, b.travelSec);
          const vx = to.x / travel;
          const vy = to.y / travel;

          this.store.spawn((ent: any) => {
            ent.kind = "bomb";
            ent.owner = p.owner;
            ent.pos = { x: p.origin.x, y: p.origin.y };
            ent.vel = { x: vx, y: vy };
            ent.ttl = Math.max(0.001, (b.ttlSec ?? b.travelSec));
            ent.damage = b.damage;
            ent.radius = b.radius;
            ent.target = { x: p.target.x, y: p.target.y };
            ent.pendingKill = false;
          });
          break;
        }

        case EventType.SPAWN_ENEMY: {
          const p = e.payload as any;
          const waveId = (typeof p?.waveId === "string") ? p.waveId : undefined;

          const def = ENEMY_DEFS[p.typeId as EnemyTypeId];
          if (!def) throw new Error(`[SpawnSystem] Unknown enemy typeId: ${String(p.typeId)}`);

          const r = def.radius ?? 4;
          const spawnPos =
            (p?.spawn && typeof p.spawn.x === "number" && typeof p.spawn.y === "number")
              ? { x: p.spawn.x, y: p.spawn.y }
              : this.pickEdgeSpawn(r);

          const forcedPresetId =
            (typeof p?.behaviorPresetId === "string" && p.behaviorPresetId.length) ? p.behaviorPresetId : undefined;

          const presetId = ((forcedPresetId ?? def.behaviorPreset ?? "none.basic") as any) as EnemyBehaviorPresetId;
          const preset = EnemyBehaviorPresets[presetId] ?? EnemyBehaviorPresets["none.basic"];

          const behaviorId = (preset.behaviorId ?? "none") as EnemyBehaviorId;
          const beh = EnemyBehaviorDB[behaviorId] ?? EnemyBehaviorDB["none"];

          this.store.spawn((ent: any) => {
            ent.kind = "enemy";
            ent.typeId = p.typeId as EnemyTypeId;
            ent.waveId = waveId;
            ent.pos = spawnPos;

            ent.vel = { x: 0, y: 0 };
            ent.hp = def.hp;
            ent.radius = def.radius;
            ent.render = def.render ? { ...def.render } : undefined;

            ent.behaviorId = (EnemyBehaviorDB[behaviorId] ? behaviorId : "none") as EnemyBehaviorId;
            ent.behavior = { ...(preset.params ?? {}) };
            ent.bState = { t: 0 };

            beh?.init?.(ent);
            ent.pendingKill = false;
          });
          break;
        }

        case EventType.SPAWN_PICKUP: {
          const p = e.payload as CMEventMap[typeof EventType.SPAWN_PICKUP];
          const pcfg = this.cfg.pickup ?? { ttlSec: 10, radius: 4, fallSpeed: 30 };

          this.store.spawn((ent: any) => {
            ent.kind = "pickup";
            ent.defId = String(p.defId ?? "unknown");
            ent.pos = { x: p.pos.x, y: p.pos.y };
            ent.vel = { x: 0, y: pcfg.fallSpeed };
            ent.radius = pcfg.radius;
            ent.ttl = pcfg.ttlSec;
            ent.pendingKill = false;
          });
          break;
        }

        default:
          break;
      }
    }
  }

  private pickEdgeSpawn(radius: number): Vec2 {
    const w = this.cfg.logicSize.w;
    const r = Math.max(1, radius);
    const x = this.cfg.rng01() * (w - 2 * r) + r;
    const y = -r - 1;
    return { x, y };
  }
}
