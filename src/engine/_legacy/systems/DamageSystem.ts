import type { EventBus } from "../../core/EventBus";
import { Phase } from "../../core/EventBus";
import { EventType, type CMEventMap } from "../../core/events";
import type { EntityRef } from "../../ecs/EntityRef";
import type { BaseEntity } from "../../ecs/ComponentTypes";
import { EntityStore } from "../../ecs/EntityStore";

export type DamageRules = {
  projectileHitEnemyDamage: number;
  playerHitEnemyDamage: number; // interpret as "energy damage" on contact
};

export class DamageSystem<T extends BaseEntity> {
  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly store: EntityStore<T>,
    private readonly rules: DamageRules,
  ) {}

  update(eventsOverride?: any[]): void {
    if (this.bus.getCurrentPhase?.() && this.bus.getCurrentPhase?.() !== Phase.Impact) {
      throw new Error("[DamageSystem] update() must run in Phase.Impact");
    }

    const events = (eventsOverride ?? this.bus.drainPhase(Phase.Impact)) as any[];

    for (const e of events) {
      switch (e.type) {
        case EventType.PROJECTILE_HIT_ENEMY: {
          const { enemy, projectile } = e.payload as {
            enemy: EntityRef;
            projectile: EntityRef;
          };

          // --- HIT FX (state-only)
          const enemyEnt: any = this.store.get(enemy);
          const projEnt: any = this.store.get(projectile);

          if (enemyEnt) {
            enemyEnt.hitFlashT = Math.max(Number(enemyEnt.hitFlashT ?? 0), 0.06);
          }

          // shards particles (optional)
          if (enemyEnt && projEnt?.vel && typeof (this.store as any).spawn === "function") {
            const vx = Number(projEnt.vel.x ?? 0);
            const vy = Number(projEnt.vel.y ?? -1);
            const len = Math.hypot(vx, vy) || 1;
            const dx = vx / len;
            const dy = vy / len;

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
                p.pos = { x: enemyEnt.pos.x, y: enemyEnt.pos.y };
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

    // emit Flow-owned result
    this.bus.emit(EventType.ENTITY_DAMAGED, {
      target: playerRef,
      amount: dmg,
      hpAfter: Number(p.energy), // reuse hpAfter as energyAfter
      source: "contact",
    });

    if (Number(p.energy) <= 0) {
      // ✅ player entita zůstává (stabilní ref). Jen přepneme do "dead" stavu.
      p.deadT = Math.max(Number(p.deadT ?? 0), 1.0); // drž mrtvý stav min. 1s (respawn delay)
      p.invulnT = Math.max(Number(p.invulnT ?? 0), 999); // žádné další kontakty během dead

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
    if (ent.pendingKill) return;

    if (typeof ent.hp !== "number") return;

    ent.hp -= amount;

    this.bus.emit(EventType.ENTITY_DAMAGED, {
      target,
      amount,
      hpAfter: ent.hp,
      source,
    });

    if (ent.hp <= 0) {
      this.store.markKill(target);

      this.bus.emit(EventType.ENTITY_KILLED, {
        target,
        source,
        isPlayer: false,
      });
    }
  }
}