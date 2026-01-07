/**
 * CollisionSystem smoke test – CM v3.1+
 * Run: npm run smoke:collision
 */

import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

import { CollisionSystem, type WorldEntity } from "./CollisionSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

type AnyEvent = { type: keyof CMEventMap; payload: CMEventMap[keyof CMEventMap] };

function isProjectileHitEnemy(
  e: AnyEvent
): e is { type: typeof EventType.PROJECTILE_HIT_ENEMY; payload: CMEventMap[typeof EventType.PROJECTILE_HIT_ENEMY] } {
  return e.type === EventType.PROJECTILE_HIT_ENEMY;
}

function main() {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  const store = new EntityStore<WorldEntity>(16);

  const owner: EntityRef = { slot: 1, gen: 1 };

  const enemy = store.spawn((e) => {
    // Spawn builder dostane "WorldEntity", my ho inicializujeme jako enemy variantu
    const ent = e as Extract<WorldEntity, { kind: "enemy" }>;
    ent.kind = "enemy";
    ent.pos = { x: 10, y: 0 };
    ent.radius = 3;
    ent.hp = 5;
    ent.pendingKill = false;
  });

  const proj = store.spawn((e) => {
    const ent = e as Extract<WorldEntity, { kind: "projectile" }>;
    ent.kind = "projectile";
    ent.owner = owner;
    ent.weapon = "primary";
    ent.pos = { x: 8, y: 0 };
    ent.vel = { x: 0, y: 0 };
    ent.ttl = 1;
    ent.damage = 3;
    ent.radius = 2;
    ent.consumed = false;
    ent.pendingKill = false;
  });

  const col = new CollisionSystem(bus, store);

  bus.beginTick(0);

  bus.enterPhase(Phase.Collision);
  col.update();

  // Impact owns hit events
  bus.enterPhase(Phase.Impact);
  const impactEvents = bus.drainPhase(Phase.Impact) as AnyEvent[];

  const hit = impactEvents.find(isProjectileHitEnemy);
  if (!hit) {
    throw new Error("[SMOKE] should emit PROJECTILE_HIT_ENEMY");
  }

  // payload je teď typově správně
  assert(hit.payload.enemy.slot === enemy.slot, "payload.enemy ref matches");
  assert(hit.payload.projectile.slot === proj.slot, "payload.projectile ref matches");

  const p = store.get(proj);
  if (!p) {
    throw new Error("[SMOKE] projectile exists");
  }

  bus.enterPhase(Phase.Cleanup);
  store.cleanup();
  bus.endTickAndSwap();

  console.log("[SMOKE] CollisionSystem OK ✅");
}

main();