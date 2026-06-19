import type { EventBus } from "../../engine/core/EventBus";
import { Phase } from "../../engine/core/EventBus";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { BaseEntity } from "../../engine/ecs/ComponentTypes";
import { EntityStore } from "../../engine/ecs/EntityStore";
export type DamageRules = {
  projectileHitEnemyDamage: number;
  playerHitEnemyDamage: number;
  onHitSpark?: (p: { x: number; y: number; dx: number; dy: number }) => void;
  onExplosion?: (p: { x: number; y: number; radius: number }) => void;
};

export class DamageSystem<T extends BaseEntity> {
  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly store: EntityStore<T>,
    private readonly rules: DamageRules,
  ) {}

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

          // shards particles (optional)
          if (enemyEnt && projEnt?.vel && typeof (this.store as any).spawn === "function") {
            const vx = Number(projEnt.vel.x ?? 0);
            const vy = Number(projEnt.vel.y ?? -1);
            const len = Math.hypot(vx, vy) || 1;
            const dx = vx / len;
            const dy = vy / len;

            // HIT SPARK uses enemy world-pos; camera subtraction happens in renderVFX()
            this.rules.onHitSpark?.({
              x: Number(enemyEnt.pos?.x ?? 0),
              y: Number(enemyEnt.pos?.y ?? 0),
              dx,
              dy,
            });

            const count = 6;
            const baseSpeed = 120;
            const spread = 0.45;

            for (let i = 0; i < count; i++) {
              const a = (Math.random() * 2 - 1) * spread;
              const ca = Math.cos(a), sa = Math.sin(a);

              const sx = dx * ca - dy * sa;
              const sy = dx * sa + dy * ca;

              const sp = baseSpeed * (0.7 + Math.random() * 0.6);
              const ttl = 0.18 + Math.random() * 0.12;

              (this.store as any).spawn((p: any) => {
                p.kind = "particle";
                p.pos = { x: Number(enemyEnt.pos?.x ?? 0), y: Number(enemyEnt.pos?.y ?? 0) };
                p.posPrev = { x: p.pos.x, y: p.pos.y };
                p.vel = { x: sx * sp, y: sy * sp };
                p.ttl = ttl;
                p.pendingKill = false;
                p.size = 2;
                p.render = { color: "#ffffff" };
              });
            }
          }

          // --- actual HP damage to enemy
          this.applyHpDamage(enemy, this.rules.projectileHitEnemyDamage, "projectile");
          break;
        }

        case EventType.PLAYER_HIT_ENEMY: {
          const { player } = e.payload as { player: EntityRef; enemy: EntityRef };
          this.applyPlayerContact(player, this.rules.playerHitEnemyDamage);
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
// explosion FX (particles-driven)
if (typeof (this.store as any).spawn === "function" && ent?.pos) {
  const ex = Number(ent.pos.x ?? 0);
  const ey = Number(ent.pos.y ?? 0);

  // base color: enemy render.color or white
  const baseCol =
    (typeof ent?.render?.color === "string" && ent.render.color.length)
      ? ent.render.color
      : "#ffffff";

  // core flash (short)
  (this.store as any).spawn((p: any) => {
    p.kind = "particle";
    p.pos = { x: ex, y: ey };
    p.posPrev = { x: ex, y: ey };
    p.vel = { x: 0, y: 0 };
    p.ttl = 0.10;
    p.pendingKill = false;
    p.size = 10;
    p.render = { color: baseCol };
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

    (this.store as any).spawn((p: any) => {
      p.kind = "particle";
      p.pos = { x: ex, y: ey };
      p.posPrev = { x: ex, y: ey };
      p.vel = { x: vx * sp, y: vy * sp };
      p.ttl = ttl;
      p.pendingKill = false;
      p.size = 2 + (Math.random() * 2);
      p.render = { color: baseCol };
    });
  }
}
  }
}
