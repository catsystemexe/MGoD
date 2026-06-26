import type { EventBus } from "../../engine/core/EventBus";
import { Phase } from "../../engine/core/EventBus";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { BaseEntity } from "../../engine/ecs/ComponentTypes";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { ParticleStore } from "../../engine/fx/ParticleStore";
import {
  createEnemyDeathGhostData,
  DEFAULT_ENEMY_DEATH_VISUAL,
  snapshotEnemyDeathVisual,
} from "../fx/EnemyDeathVisual";

export type DamageRules = {
  projectileHitEnemyDamage: number;
  playerHitEnemyDamage: number;
  onHitSpark?: (p: { x: number; y: number; dx: number; dy: number }) => void;
  onExplosion?: (p: { x: number; y: number; radius: number }) => void;
};

function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class DamageSystem<T extends BaseEntity> {
  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly store: EntityStore<T>,
    private readonly particleStore: ParticleStore,
    private readonly rules: DamageRules,
  ) {}

  /** True when the shared ECS pool has at least one free slot for optional cosmetic FX. */
  private canSpawnCosmeticEntity(): boolean {
    return this.store.aliveCount() < this.store.getCapacity();
  }

  private trySpawnCosmeticEntity(factory: (e: T) => void): EntityRef | null {
    if (!this.canSpawnCosmeticEntity()) return null;
    try {
      return this.store.spawn(factory);
    } catch (err) {
      if (err instanceof Error && err.message.includes("[EntityStore] Out of capacity")) return null;
      throw err;
    }
  }

  update(eventsOverride?: any[]): void {
    const phase = (this.bus as any).getCurrentPhase?.();
    if (phase && phase !== Phase.Impact) {
      throw new Error("[DamageSystem] update() must run in Phase.Impact");
    }

    const events = (eventsOverride ?? this.bus.drainPhase(Phase.Impact)) as any[];

    for (const e of events) {
      switch (e.type) {
        case EventType.PROJECTILE_HIT_ENEMY: {
          const { enemy, projectile } = e.payload as { enemy: EntityRef; projectile: EntityRef };

          const enemyEnt: any = this.store.get(enemy);
          const projEnt: any = this.store.get(projectile);

          // --- HIT FX (state-only)
          if (enemyEnt) {
            enemyEnt.hitFlashT = Math.max(Number(enemyEnt.hitFlashT ?? 0), 0.06);

            // future-ready: rail -> chase trigger on hit (only if enemy has ai overlay)
            if (enemyEnt.ai && typeof enemyEnt.ai === "object") {
              enemyEnt.aiWeightTarget = 1;
            }
          }

          // shards particles → ParticleStore ring buffer
          if (enemyEnt && projEnt?.vel) {
            const vx = Number(projEnt.vel.x ?? 0);
            const vy = Number(projEnt.vel.y ?? -1);
            const len = Math.hypot(vx, vy) || 1;
            const dx = vx / len;
            const dy = vy / len;

            this.rules.onHitSpark?.({
              x: Number(enemyEnt.pos?.x ?? 0),
              y: Number(enemyEnt.pos?.y ?? 0),
              dx,
              dy,
            });

            const ex = Number(enemyEnt.pos?.x ?? 0);
            const ey = Number(enemyEnt.pos?.y ?? 0);
            const count = 4;
            const baseSpeed = 80;
            const spread = 0.3;

            for (let i = 0; i < count; i++) {
              const a = (Math.random() * 2 - 1) * spread;
              const ca = Math.cos(a), sa = Math.sin(a);
              const sx = dx * ca - dy * sa;
              const sy = dx * sa + dy * ca;
              const sp = baseSpeed * (0.7 + Math.random() * 0.6);
              const ttl = 0.18 + Math.random() * 0.12;

              this.particleStore.emit({
                x: ex, y: ey,
                vx: sx * sp, vy: sy * sp,
                ttl, maxTtl: ttl,
                r: 1, g: 1, b: 1,
                size: 1,
                kind: "shard",
              });
            }
          }

          // --- actual HP damage to enemy (per-projectile if available, else global rule)
          const projDmg = (projEnt && typeof projEnt.damage === "number" && projEnt.damage > 0)
            ? projEnt.damage
            : this.rules.projectileHitEnemyDamage;
          this.applyHpDamage(enemy, projDmg, "projectile");
          break;
        }

        case EventType.PLAYER_HIT_ENEMY: {
          const { player } = e.payload as { player: EntityRef; enemy: EntityRef };
          this.applyPlayerContact(player, this.rules.playerHitEnemyDamage);
          break;
        }

        case EventType.ENEMY_PROJECTILE_HIT_PLAYER: {
          const { player, damage: epDmg } = e.payload as CMEventMap[typeof EventType.ENEMY_PROJECTILE_HIT_PLAYER];
          const hitPlayer: any = this.store.get(player);
          if (hitPlayer?.pos) {
            const px = Number(hitPlayer.pos.x ?? 0);
            const py = Number(hitPlayer.pos.y ?? 0);
            for (let i = 0; i < 4; i++) {
              const ang = Math.random() * Math.PI * 2;
              const sp = 80 + Math.random() * 60;
              const ttl = 0.12 + Math.random() * 0.08;
              this.particleStore.emit({
                x: px, y: py,
                vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
                ttl, maxTtl: ttl,
                r: 1, g: 0.3, b: 0.3,
                size: 2,
                kind: "shard",
              });
            }
          }
          this.applyPlayerContact(player, epDmg);
          break;
        }

        case EventType.PROJECTILE_HIT_CA:
          // CA handled elsewhere
          break;

        case EventType.EXPLOSION: {
          const { x, y, radius, damage, source } =
            e.payload as CMEventMap[typeof EventType.EXPLOSION];

          // VFX hook (world coords; renderer subtracts camera)
          this.rules.onExplosion?.({ x, y, radius });

          // AoE: collect every enemy whose circle overlaps the blast, THEN damage.
          // (collect-first avoids mutating the store mid-iteration via markKill)
          const victims: EntityRef[] = [];
          (this.store as any).debugForEachAlive((ref: EntityRef, ent: any) => {
            if (!ent || ent.pendingKill) return;
            if (ent.kind !== "enemy") return;
            const ddx = Number(ent.pos?.x ?? 0) - x;
            const ddy = Number(ent.pos?.y ?? 0) - y;
            const rr = radius + Number(ent.radius ?? 0);
            if (ddx * ddx + ddy * ddy <= rr * rr) victims.push(ref);
          });

          for (const v of victims) this.applyHpDamage(v, damage, source);
          break;
        }

        default:
          throw new Error(`[DamageSystem] Unexpected event in Impact drain: ${String(e.type)}`);
      }
    }
  }

  private applyPlayerContact(playerRef: EntityRef, amount: number): void {
    const p: any = this.store.get(playerRef);
    if (!p) return;
    if (p.pendingKill) return;

    // i-frame gate (extra safety; Collision also gates)
    const inv = Number(p.invulnT ?? 0);
    if (Number.isFinite(inv) && inv > 0) return;

    const dmg = Math.max(0, Number(amount ?? 1));

    // init energy if missing
    const max = Number(p.energyMax ?? 5);
    if (!Number.isFinite(max) || max <= 0) p.energyMax = 5;

    const cur = Number(p.energy);
    if (!Number.isFinite(cur)) p.energy = Number(p.energyMax);

    p.energy = Math.max(0, Number(p.energy) - dmg);

    // set i-frames + flash
    p.invulnT = Math.max(Number(p.invulnT ?? 0), 0.75);
    p.hitFlashT = Math.max(Number(p.hitFlashT ?? 0), 0.1);

    this.bus.emit(EventType.ENTITY_DAMAGED, {
      target: playerRef,
      amount: dmg,
      hpAfter: Number(p.energy), // reuse hpAfter as energyAfter
      source: "contact",
    });

    if (Number(p.energy) <= 0) {
      // player entity stays (stable ref). Switch to dead state.
      p.deadT = Math.max(Number(p.deadT ?? 0), 1.0); // respawn delay
      p.invulnT = Math.max(Number(p.invulnT ?? 0), 999);

      this.bus.emit(EventType.ENTITY_KILLED, {
        target: playerRef,
        source: "contact",
        isPlayer: true,
      });
    }
  }

  private applyHpDamage(target: EntityRef, amount: number, source: string): void {
    const ent: any = this.store.get(target);
    if (!ent) return;

    // guard: already dead / dying
    if (ent.pendingKill) return;
    if (typeof ent.hp !== "number") return;
    if (ent.hp <= 0) return;

    const dmg = Math.max(0, Number(amount ?? 0));
    if (!(dmg > 0)) return;

    ent.hp -= dmg;

    this.bus.emit(EventType.ENTITY_DAMAGED, {
      target,
      amount: dmg,
      hpAfter: ent.hp,
      source,
    });

    if (ent.hp > 0) return;

    // idempotent kill path
    if ((ent as any).__deathFxDone) {
      this.store.markKill(target);
      return;
    }
    (ent as any).__deathFxDone = true;
    const deathSnapshot = snapshotEnemyDeathVisual(ent);

    // markKill EARLY so other systems skip it in same tick
    this.store.markKill(target);

    // Flow-owned kill event so ScoreSystem (and other Flow listeners) can react.
    // Mirrors applyPlayerContact's emit() exactly; only difference is isPlayer: false.
    // NOTE: this also activates LootDropSystem for enemy kills (25% roll →
    // emits SPAWN_PICKUP), which SpawnSystem currently silently drops
    // (handler commented out, default: break). This is intentional/accepted —
    // pickups remain a separate open scope decision.
    this.bus.emit(EventType.ENTITY_KILLED, {
      target,
      source,
      isPlayer: false,
    });
// explosion FX → ParticleStore ring buffer
if (ent?.pos) {
  const ex = Number(ent.pos.x ?? 0);
  const ey = Number(ent.pos.y ?? 0);

  const baseCol =
    (typeof ent?.render?.color === "string" && ent.render.color.length)
      ? ent.render.color
      : "#ffffff";
  const [cr, cg, cb] = hexToRgb01(baseCol);

  // core flash
  this.particleStore.emit({
    x: ex, y: ey, vx: 0, vy: 0,
    ttl: 0.10, maxTtl: 0.10,
    r: cr, g: cg, b: cb,
    size: 10,
    kind: "flash",
  });

  // burst shards
  const count = 18;
  const baseSpeed = 220;

  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const jitter = (Math.random() * 2 - 1) * 0.25;
    const a = ang + jitter;
    const vx = Math.cos(a);
    const vy = Math.sin(a);
    const sp = baseSpeed * (0.55 + Math.random() * 0.75);
    const ttl = 0.22 + Math.random() * 0.22;

    this.particleStore.emit({
      x: ex, y: ey,
      vx: vx * sp, vy: vy * sp,
      ttl, maxTtl: ttl,
      r: cr, g: cg, b: cb,
      size: 2 + (Math.random() * 2),
      kind: "shard",
    });
  }

  // Animated sprite explosion FX. Uses local fxAge for deterministic renderer timing.
  this.trySpawnCosmeticEntity((fx: any) => {
      fx.kind = "fx";
      fx.pos = { x: ex, y: ey };
      fx.posPrev = { x: ex, y: ey };
      fx.vel = { x: 0, y: 0 };
      fx.ttl = 0.5;
      fx.fxAge = 0;
      fx.spawnT = 0;
      fx.animId = DEFAULT_ENEMY_DEATH_VISUAL.explosionId;
      fx.spriteId = `${DEFAULT_ENEMY_DEATH_VISUAL.explosionId}.0`;
      fx.explosionScale = DEFAULT_ENEMY_DEATH_VISUAL.explosionScale;
      fx.radius = 40 * DEFAULT_ENEMY_DEATH_VISUAL.explosionScale;
      fx.render = {};
    });

  // Render-only enemy death ghost FX. Optional cosmetic; explosion has priority.
  if (deathSnapshot) {
    const ghost = createEnemyDeathGhostData(
      { typeId: deathSnapshot.typeId, pos: deathSnapshot.pos, posPrev: deathSnapshot.posPrev, radius: deathSnapshot.radius, render: deathSnapshot.render },
      DEFAULT_ENEMY_DEATH_VISUAL,
    );
    if (ghost) {
      this.trySpawnCosmeticEntity((fx: any) => {
        fx.kind = ghost.kind;
        fx.pos = ghost.pos;
        fx.posPrev = ghost.posPrev;
        fx.vel = ghost.vel;
        fx.ttl = ghost.ttl;
        fx.fxAge = 0;
        fx.radius = ghost.radius;
        fx.deathVisual = ghost.deathVisual;
      });
    }
  }
}
  }
}
