import { EventBus, Phase } from "../core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../core/events";
import { EntityStore } from "../ecs/EntityStore";
import type { BaseEntity } from "../ecs/ComponentTypes";
import { DamageSystem } from "./DamageSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

interface TestEntity extends BaseEntity {
  hp: number;
  kind: string;
}

function main() {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  const store = new EntityStore<TestEntity>(8);

  const enemy = store.spawn(e => {
    e.kind = "enemy";
    e.hp = 5;
  });

  const dmg = new DamageSystem(bus, store, {
    projectileHitEnemyDamage: 3,
    playerHitEnemyDamage: 999,
  });

  // -----------------------
  // TICK 0: hit -> hp 2
  // -----------------------
  bus.beginTick(0);

  bus.enterPhase(Phase.Collision);
  bus.emit(EventType.PROJECTILE_HIT_ENEMY, { projectile: { slot: 7, gen: 1 }, enemy });

  bus.enterPhase(Phase.Impact);
  dmg.update();

  // FLOW drains result events (ENTITY_DAMAGED / ENTITY_KILLED / CA_CELLS_KILLED)
  bus.enterPhase(Phase.Flow);
  bus.drainPhase(Phase.Flow);

  const e1 = store.get(enemy);
  assert(e1 !== null, "enemy still exists after tick0 impact");
  assert(e1!.hp === 2, "enemy hp after first hit should be 2");
  assert(e1!.pendingKill === false, "enemy should not be pendingKill after first hit");

  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  // -----------------------
  // TICK 1: second hit -> pendingKill -> cleanup -> gone
  // -----------------------
  bus.beginTick(1);

  bus.enterPhase(Phase.Collision);
  bus.emit(EventType.PROJECTILE_HIT_ENEMY, { projectile: { slot: 7, gen: 1 }, enemy });

  bus.enterPhase(Phase.Impact);
  dmg.update();

  bus.enterPhase(Phase.Flow);
  bus.drainPhase(Phase.Flow);

  const e2 = store.get(enemy);
  assert(e2 !== null, "enemy accessible before cleanup (two-phase kill)");
  assert(e2!.pendingKill === true, "enemy marked pendingKill after lethal hit");

  // Cleanup commits kill
  store.cleanup();
  assert(store.get(enemy) === null, "enemy invalid after cleanup commit");

  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] DamageSystem OK ✅");
}

main();