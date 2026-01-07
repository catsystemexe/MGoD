import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";

import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

import { CollisionSystem, type WorldEntity } from "./CollisionSystem";
import { DamageSystem } from "../../engine/_legacy/systems/DamageSystem";
import { ScoreSystem, type SessionState } from "./ScoreSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function main() {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  const store = new EntityStore<WorldEntity>(32);

  const ship: EntityRef = { slot: 1, gen: 1 };

  // Enemy: hp == projectile damage => must die this tick
  const enemy = store.spawn(e => {
    e.kind = "enemy";
    e.pos = { x: 10, y: 0 };
    e.radius = 3;
    e.hp = 3;
    e.pendingKill = false;
  });

  // Projectile overlaps enemy => collision must emit hit
  const proj = store.spawn(e => {
    e.kind = "projectile";
    e.owner = ship;
    e.weapon = "primary";
    e.pos = { x: 8, y: 0 };
    e.vel = { x: 0, y: 0 };
    e.ttl = 1;
    e.damage = 3;
    e.radius = 2;
    e.pendingKill = false;
    e.consumed = false;
  });

  const collision = new CollisionSystem(bus, store);

  // NOTE: pokud máš DamageSystem typovaný jinak, uprav jen config.
  const damage = new DamageSystem(bus, store as any, {
    projectileHitEnemyDamage: 3,
    playerHitEnemyDamage: 999,
  });

  const session: SessionState = { score: 0 };
  const score = new ScoreSystem(bus, session, {
    pointsPerEnemyKill: 10,
    pointsPerCellKilled: 1,
  });

  // --- Tick 0 end-to-end ---
  bus.beginTick(0);

  bus.enterPhase(Phase.Collision);
  collision.update();

  bus.enterPhase(Phase.Impact);
  damage.update();

  bus.enterPhase(Phase.Flow);
  score.update();

  bus.enterPhase(Phase.Cleanup);
  store.cleanup();

  bus.endTickAndSwap();

  // --- Assertions ---
  assert(store.get(enemy) === null, "enemy should be removed after cleanup");
  assert(session.score === 10, "score should increase by kill points");

  const p = store.get(proj) as any;
  assert(p === null || p.consumed === true, "projectile should be consumed (or removed)");

  console.log("[SMOKE] CombatLoop OK ✅");
}

main();
