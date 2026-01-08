
import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import type { TickContext } from "../../engine/core/Loop";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

import { CollisionSystem, type WorldEntity } from "./CollisionSystem";
import { DamageSystem } from "../../engine/_legacy/systems/DamageSystem";

import { FlowDispatcher } from "../systems/FlowDispatcher";
import { FlowSystem } from "../systems/FlowSystem";
import { ScoreSystem } from "../systems/ScoreSystem";
import { makeSessionState } from "../data/SessionState";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function main() {
  const bus = new EventBus(CM_EVENT_OWNERSHIP, {
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
    (e as any).kind = "enemy";
    (e as any).pos = { x: 10, y: 0 };
    (e as any).radius = 3;
    (e as any).hp = 3;
    (e as any).pendingKill = false;
  });

  // Projectile overlaps enemy => collision must emit hit
  const proj = store.spawn(e => {
    (e as any).kind = "projectile";
    (e as any).owner = ship;
    (e as any).weapon = "primary";
    (e as any).pos = { x: 8, y: 0 };
    (e as any).vel = { x: 0, y: 0 };
    (e as any).ttl = 1;
    (e as any).damage = 3;
    (e as any).radius = 2;
    (e as any).pendingKill = false;
    (e as any).consumed = false;
  });

  const collision = new CollisionSystem(bus as any, store as any);

  // Legacy DamageSystem – config only
  const damage = new DamageSystem(bus as any, store as any, {
    projectileHitEnemyDamage: 3,
    playerHitEnemyDamage: 999,
  });

  // --- Flow pipeline (aktuální architektura)
  const session = makeSessionState();
  const score = new ScoreSystem(session, { pointsPerCell: 1, pointsPerEntityKill: 10 });
  const flowDispatcher = new FlowDispatcher([score]);
  const flow = new FlowSystem(flowDispatcher);

  const ctx: TickContext = { tick: 0, dt: 1 / 60 };

  // --- Tick 0 end-to-end ---
  bus.beginTick(0);

  bus.enterPhase(Phase.Collision);
  collision.update();

  bus.enterPhase(Phase.Impact);
  damage.update();

  bus.enterPhase(Phase.Flow);
  const flowEvents = bus.drainPhase(Phase.Flow) as any[];
  flow.update(ctx, flowEvents as any);

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