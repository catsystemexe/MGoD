/**
 * DamageSystem (CM v3.1)
 * Phase 4 (Impact):
 * - drains Phase.Impact hit events
 * - applies HP changes (no rendering, no audio)
 * - marks pendingKill (two-phase kill)
 * - emits ENTITY_DAMAGED / ENTITY_KILLED (ownership decides where they get drained)
 */

import type { EventBus } from "../../core/EventBus";
import { Phase } from "../../core/EventBus";
import { EventType, type CMEventMap } from "../../core/events";
import type { EntityRef } from "../../ecs/EntityRef";
import type { BaseEntity } from "../../ecs/ComponentTypes";
import { EntityStore } from "../../ecs/EntityStore";

export type Damageable = BaseEntity & {
  hp: number;
};

export type DamageRules = {
  projectileHitEnemyDamage: number; // MVP fixed number, later data-driven per projectile/enemy
  playerHitEnemyDamage: number;
};

export class DamageSystem<T extends Damageable> {
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
          const { enemy } = e.payload as { enemy: EntityRef; projectile: EntityRef };
          this.applyDamage(enemy, this.rules.projectileHitEnemyDamage, "projectile");
          break;
        }

        case EventType.PLAYER_HIT_ENEMY: {
          const { player } = e.payload as { player: EntityRef; enemy: EntityRef };
          this.applyDamage(player, this.rules.playerHitEnemyDamage, "contact");
          break;
        }

        // CA hits handled by CAImpactSystem, not here
        case EventType.PROJECTILE_HIT_CA:
          // ignore
          break;

        default:
          // In strict mode, unexpected events in Impact drain are contract violations.
          // If you want softer behavior, change to "continue".
          throw new Error(`[DamageSystem] Unexpected event in Impact drain: ${String(e.type)}`);
      }
    }
  }

  private applyDamage(target: EntityRef, amount: number, source: string): void {
    const ent = this.store.get(target);
    if (!ent) return;

    // already marked for death -> ignore additional damage this tick (keeps determinism stable)
    if (ent.pendingKill) return;

    ent.hp -= amount;

    this.bus.emit(EventType.ENTITY_DAMAGED, {
      target,
      amount,
      source,
      hpAfter: ent.hp,
    });

    if (ent.hp <= 0) {
      // Two-phase kill: mark now, commit in Cleanup phase
      this.store.markKill(target);

      this.bus.emit(EventType.ENTITY_KILLED, {
        target,
        source,
      });
    }
  }
}
