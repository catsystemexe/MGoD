// src/game/systems/SpawnSystem.ts
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { AnyEvent, TickContext } from "../../engine/core/Loop";

import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { BaseEntity } from "../../engine/ecs/ComponentTypes";

import type { EnemyBehaviorId, EnemyBehaviorParams, EnemyBehaviorRuntime } from "../enemies/EnemyBehaviorTypes";
import { EnemyBehaviorDB } from "../enemies/EnemyBehaviorDB";
import { COLORS } from "../../rendering/ColorPalette";
import { EnemyBehaviorPresets, type EnemyBehaviorPresetId } from "../enemies/EnemyBehaviorPresets";

import { ENEMY_DEFS, type EnemyTypeId } from "../defs/EnemyDefs";

type Vec2 = { x: number; y: number };
import type { WorldState } from "../data/WorldState";
import type { WeaponDB } from "../defs/Weapons";

export interface SpawnSystemConfig {
  rng01: () => number;
  logicSize: { w: number; h: number };
  weaponDb: WeaponDB;
  bomb?: { travelSec: number; ttlSec?: number; damage: number; radius: number; explosionRadius: number };
  pickup?: { ttlSec: number; radius: number; fallSpeed: number };
}

export interface ProjectileEntity extends BaseEntity {
  kind: "projectile";
  owner: EntityRef;
  weaponTypeId: string;
  
    // Sprite MVP v1 (optional; renderer falls back if missing)
    spriteId?: string;
    animId?: string;

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
  explosionRadius: number;
  target: Vec2;
}

export interface PickupEntity extends BaseEntity {
  kind: "pickup";
  defId: string;
  

    // Sprite MVP v1 (optional; renderer falls back if missing)
    spriteId?: string;
    animId?: string;

pos: Vec2;
  vel: Vec2;
  radius: number;
  ttl: number;
}

export interface EnemyEntity extends BaseEntity {
  kind: "enemy";
  typeId: EnemyTypeId;
  waveId?: string;

  // stable per-spawn index (used for desync: phases, patterns, etc.)
  spawnOrdinal?: number;

  // Sprite MVP v1 (optional; renderer falls back if missing)
  spriteId?: string;
  animId?: string;

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
        private readonly world: WorldState,
      ) {
    if (typeof this.cfg?.rng01 !== "function") throw new Error(`[SpawnSystem] cfg.rng01 must be a function`);
    if (!this.cfg.logicSize || typeof this.cfg.logicSize.w !== "number" || typeof this.cfg.logicSize.h !== "number") {
      throw new Error(`[SpawnSystem] cfg.logicSize must be {w:number,h:number}`);
    }
    if (!this.cfg.weaponDb || typeof this.cfg.weaponDb !== "object") {
      throw new Error(`[SpawnSystem] cfg.weaponDb must be provided (WeaponDB)`);
    }
  }

  update(_ctx: TickContext, events: Array<AnyEvent<CMEventMap>>): void {
    for (const e of events) {
      switch (e.type) {
        case EventType.SPAWN_PROJECTILE: {
          const p = e.payload as CMEventMap[typeof EventType.SPAWN_PROJECTILE];
 
          
          const weaponTypeId = p.weaponTypeId;
          const def = this.cfg.weaponDb[weaponTypeId];
          const wcfg = def?.projectile;
          if (!wcfg) {
            if ((globalThis as any).__CM_DEBUG_PROJECTILES) {
              console.warn("[SPAWN_PROJECTILE] missing projectile cfg for weaponTypeId=", weaponTypeId, "def=", def);
            }
            break;
          }

          // DEBUG: enable in browser console: __CM_DEBUG_PROJECTILES = true
          if ((globalThis as any).__CM_DEBUG_PROJECTILES) {
            // keep it small to avoid spam
            console.log("[SPAWN_PROJECTILE]", weaponTypeId, p.origin.x, p.origin.y, p.dir.x, p.dir.y, wcfg.speed, wcfg.ttlSec);
          }
          
          const dx = p.dir.x;
          const dy = p.dir.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = dx / len;
          const ny = dy / len;
  this.store.spawn((ent: any) => {
    ent.kind = "projectile";
    ent.owner = p.owner;
    ent.weaponTypeId = weaponTypeId;



      // weaponTypeId is the concrete weapon type from the spawn payload:
      //   "w1.basic" = primary slot, "w2.basic" = secondary slot (w2 prefix).
      // Secondary bolts are visually distinct (magenta + larger) from primary.
      const isSecondary = String(weaponTypeId).startsWith("w2");
      ent.render = {
        glyphId: "proj.capsule",
        sdf: {
          shape: isSecondary ? "orb" : "bolt",
          color: isSecondary ? COLORS.ORB : COLORS.BOLT,
          size: isSecondary ? 2.0 : 5.0,
        },
      };
      // Sprite MVP v1: default mapping (renderer will ignore if atlas lacks these keys)
      // Later: weapon DB can override this.
      ent.animId = "projectile.w1";
      ent.spriteId = "projectile.w1.0";

    const x = Number(p.origin.x);
    const y = Number(p.origin.y);
    ent.pos = { x, y };
    ent.posPrev = { x, y };

    ent.vel = { x: nx * wcfg.speed, y: ny * wcfg.speed };
    ent.ttl = Math.max(0.001, wcfg.ttlSec);
    ent.damage = wcfg.damage;
    ent.radius = wcfg.radius;

     // keep these for collision/damage
    ent.consumed = false;
    ent.pendingKill = false;
  });

          break;
        }

          case EventType.SPAWN_BOMB: {
            const p = e.payload as CMEventMap[typeof EventType.SPAWN_BOMB];
            const b = (this.cfg as any).bomb;
            if (!b) break;

            const to = { x: p.target.x - p.origin.x, y: p.target.y - p.origin.y };
            const travel = Math.max(0.001, Number(b.travelSec ?? 0.25));
            const vx = to.x / travel;
            const vy = to.y / travel;

            this.store.spawn((ent: any) => {
              ent.kind = "bomb";
              ent.owner = p.owner;
              ent.pos = { x: p.origin.x, y: p.origin.y };
              ent.posPrev = { x: p.origin.x, y: p.origin.y };
              ent.vel = { x: vx, y: vy };
              ent.ttl = Math.max(0.001, Number(b.ttlSec ?? b.travelSec ?? 0.25));
              ent.damage = Number(b.damage ?? 0);
              ent.radius = Number(b.radius ?? 1);
              ent.explosionRadius = Number(b.explosionRadius ?? b.radius ?? 1);
              ent.target = { x: p.target.x, y: p.target.y };
              ent.pendingKill = false;
            });

            break;
          }

                case EventType.SPAWN_ENEMY: {
            const p = e.payload as CMEventMap[typeof EventType.SPAWN_ENEMY];
            if ((globalThis as any).__DEV__ && Math.random() < 0.03) {
              console.log("[SPAWN_SYS][IN]", { typeId: (p as any)?.typeId, spawn: (p as any)?.spawn, waveId: (p as any)?.waveId });
            }
          const waveId = (typeof p?.waveId === "string") ? p.waveId : undefined;

          const spawnOrdinal = (typeof (p as any)?.spawnOrdinal === "number" && Number.isFinite((p as any).spawnOrdinal))
          ? (p as any).spawnOrdinal
          : 0;

          const spawnAgeSec =
            (typeof (p as any)?.spawnAgeSec === "number" && Number.isFinite((p as any).spawnAgeSec) && (p as any).spawnAgeSec > 0)
              ? (p as any).spawnAgeSec
              : 0;
          
const def = ENEMY_DEFS[p.typeId as EnemyTypeId];
if (!def) throw new Error(`[SpawnSystem] Unknown enemy typeId: ${String(p.typeId)}`);

const r = (typeof def.radius === "number" && Number.isFinite(def.radius) && def.radius > 0) ? def.radius : 4;

              const spawnPos =
                (p?.spawn && typeof p.spawn.x === "number" && typeof p.spawn.y === "number")
                  ? { x: Number(p.spawn.x), y: Number(p.spawn.y) }
                  : this.pickEdgeSpawn(r);

          const forcedPresetId =
            (typeof p?.behaviorPresetId === "string" && p.behaviorPresetId.length) ? p.behaviorPresetId : undefined;

          const presetId = ((forcedPresetId ?? def.behaviorPreset ?? "none.basic") as any) as EnemyBehaviorPresetId;
          const preset = EnemyBehaviorPresets[presetId] ?? EnemyBehaviorPresets["none.basic"];

          const behaviorId = (preset.behaviorId ?? "none") as EnemyBehaviorId;
          const beh = EnemyBehaviorDB[behaviorId] ?? EnemyBehaviorDB["none"];

          // Unified contract: all gameplay entities live in WORLD space.
          // Enemy spawn patterns are authored viewport-relative (where on screen we
          // want them to appear), so convert pattern -> world ONCE here by adding the
          // current scroll. Projectiles/bombs need no such conversion: their origin
          // already comes from the player (WORLD) via WeaponSystem.
          const x = Number(spawnPos.x) + Number(this.world?.scrollX ?? 0);
          const y = Number(spawnPos.y) + Number(this.world?.scrollY ?? 0);
          this.store.spawn((ent: any) => {
            ent.kind = "enemy";
            ent.typeId = p.typeId as EnemyTypeId;
            ent.waveId = waveId;


            // Sprite keys: keep empty by default (glyph/proc are default MVP)
            ent.spriteId = def.spriteId ?? "";
            ent.animId = "";

            if ((globalThis as any).__DEV__) {
              if (Math.random() < 0.05) {
                console.log("[SPAWN_ENEMY_RENDER_KEYS]", { typeId: p.typeId, spriteId: ent.spriteId, animId: ent.animId });
              }
            }



            
            // ✅ BE V1 deterministic index
            ent.spawnOrdinal = spawnOrdinal;
            // ✅ BE V1 deterministic index
            
            // CLONE + INIT PREV (KEY FIX)
            ent.pos = { x, y };
            ent.posPrev = { x, y };

            ent.vel = { x: 0, y: 0 };
            ent.hp = def.hp;
            ent.maxHp = def.hp;
            ent.radius = r;
            const dr: any = def.render;
            ent.render = dr
              ? {
                  ...(dr.color ? { color: dr.color } : {}),
                  ...(dr.glyphId ? { glyphId: dr.glyphId } : {}),
                  ...(dr.glyphs ? { glyphs: (Array.isArray(dr.glyphs) ? dr.glyphs.map((g: any) => ({ ...g })) : undefined) } : {}),
                  ...(dr.proc ? { proc: (dr.proc && typeof dr.proc === "object"
                      ? { ...dr.proc, parts: Array.isArray(dr.proc.parts) ? dr.proc.parts.map((p: any) => ({ ...p })) : dr.proc.parts }
                      : dr.proc) } : {}),
                  ...(dr.sdf ? { sdf: { ...dr.sdf } } : {}),
                }
              : {};
      if (ent.render) {
  const rr: any = ent.render as any;
    if (!rr.glyphId && !rr.proc && !(Array.isArray(rr.glyphs) && rr.glyphs.length)) {
    const tid = String(ent.typeId ?? "");
    rr.glyphId = tid ? ("enemy." + tid) : "enemy.diamond";
  }
}
// OPTIONAL AI overlay (disabled unless def.ai exists)
            ent.ai = (def as any).ai ? { ...(def as any).ai } : undefined;
            ent.aiWeight = typeof (def as any).aiWeight === "number" ? (def as any).aiWeight : 0;
            ent.aiWeightTarget = ent.aiWeight;
            ent.aiEaseSec = typeof (def as any).aiEaseSec === "number" ? (def as any).aiEaseSec : 0.12;

            ent.behaviorId = (EnemyBehaviorDB[behaviorId] ? behaviorId : "none") as EnemyBehaviorId;
            ent.behavior = { ...(preset.params ?? {}) };
            ent.bState = { t: spawnAgeSec };

            beh?.init?.(ent);

            // If init moved pos, keep prev in sync (prevents spawn pop)
            ent.posPrev.x = ent.pos.x;
            ent.posPrev.y = ent.pos.y;

            ent.pendingKill = false;
          });
          break;
        }

          case EventType.SPAWN_PICKUP: {
            const p = e.payload as CMEventMap[typeof EventType.SPAWN_PICKUP];
            const pcfg = this.cfg.pickup ?? { ttlSec: 10, radius: 4, fallSpeed: 30 };

            // p.pos originates from a killed enemy => already WORLD space (unified
            // contract). Do NOT add scroll here (unlike viewport-relative enemy
            // spawn patterns); the position is already absolute world coords.
            const x = Number(p.pos?.x ?? 0);
            const y = Number(p.pos?.y ?? 0);

            this.store.spawn((ent: any) => {
              ent.kind = "pickup";
              ent.defId = String(p.defId ?? "unknown");

              ent.pos = { x, y };
              ent.posPrev = { x, y }; // IMPORTANT: prevents shimmer/pop on first frames

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
        const h = this.cfg.logicSize.h;
        const r = Math.max(1, radius);

        // spawn slightly OFFSCREEN on the right edge (viewport space)
        const x = w + r + 1;

        // random y within viewport
        const y = this.cfg.rng01() * (h - 2 * r) + r;

        return { x, y };
      }
}
