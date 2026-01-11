/**
 * Loop smoke test – CM v3.1+
 * Run: npm run smoke:loop
 *
 * Purpose:
 * - Projede "tick pipeline" ve správných fázích:
 *   Collision -> Impact -> Flow -> Cleanup -> endTick
 * - Ověří, že kill event vede na score.
 */

import { EventBus, Phase } from "./EventBus";
import { CM_EVENT_OWNERSHIP } from "./EventOwnershipMap";
import type { CMEventMap } from "./events";

import { EntityStore } from "../ecs/EntityStore";
import type { EntityRef } from "../ecs/EntityRef";

// ✅ game systems (správné cesty z engine/core)
import { CollisionSystem, type WorldEntity } from "../../game/systems/CollisionSystem";
import { ScoreSystem, type SessionState } from "../../game/systems/ScoreSystem";

// ✅ legacy damage (už je přesunuté)
import { DamageSystem } from "../../game/systems/DamageSystem";

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
  const enemy = store.spawn((e) => {
    const ent = e as Extract<WorldEntity, { kind: "enemy" }>;
    ent.kind = "enemy";
    ent.pos = { x: 10, y: 0 };
    ent.radius = 3;
    ent.hp = 3;
    ent.pendingKill = false;
  });

  // Projectile overlaps enemy => collision must emit hit
  const proj = store.spawn((e) => {
    const ent = e as Extract<WorldEntity, { kind: "projectile" }>;
    ent.kind = "projectile";
    ent.owner = ship;
    ent.weapon = "primary";
    ent.pos = { x: 8, y: 0 };
    ent.vel = { x: 0, y: 0 };
    ent.ttl = 1;
    ent.damage = 3;
    ent.radius = 2;
    ent.pendingKill = false;
    ent.consumed = false;
  });

  const collision = new CollisionSystem(bus, store);

  // Legacy DamageSystem config
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

  // ⚠️ Pokud DamageSystem emituje cokoliv vlastněné Impactem a ty to nechceš řešit v tomhle smoke,
  // tak to MUSÍŠ vycucnout, jinak failFast.
  bus.drainPhase(Phase.Impact);

  bus.enterPhase(Phase.Flow);
  score.update();

  bus.enterPhase(Phase.Cleanup);
  store.cleanup();

  bus.endTickAndSwap();

  // --- Assertions ---
  assert(store.get(enemy) === null, "enemy should be removed after cleanup");
  assert(session.score === 10, "score should increase by kill points");

  const p = store.get(proj);
  if (p !== null) {
    const pe = p as Extract<WorldEntity, { kind: "projectile" }>;
    assert(pe.consumed === true, "projectile should be consumed if still alive");
  }

  console.log("[SMOKE] Loop OK ✅");
}

main();