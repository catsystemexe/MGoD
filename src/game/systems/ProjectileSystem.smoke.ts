import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import type { CMEventMap } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

import type { SpawnableEntity } from "./SpawnSystem";
import { ProjectileSystem } from "./ProjectileSystem";

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

  const store = new EntityStore<SpawnableEntity>(16);

  const owner: EntityRef = { slot: 1, gen: 1 };

  const projRef = store.spawn(e => {
    e.kind = "projectile";
    e.owner = owner;
    e.weapon = "primary";
    e.pos = { x: 0, y: 0 };
    e.vel = { x: 10, y: 0 };
    e.ttl = 0.05;
    e.damage = 3;
    e.radius = 2;
    e.pendingKill = false;
  });

  const sys = new ProjectileSystem(bus, store, {
    enabled: true,
    min: { x: -100, y: -100 },
    max: { x: 100, y: 100 },
  });

  // Tick 0: move a bit, still alive
  bus.beginTick(0);
  bus.enterPhase(Phase.Simulation);
  sys.update(0.016);

  const p1 = store.get(projRef);
  assert(p1 !== null, "projectile still exists");
  assert(p1!.pos.x > 0, "projectile moved");
  assert(p1!.pendingKill === false, "not killed yet");

  bus.enterPhase(Phase.Cleanup);
  store.cleanup();
  bus.endTickAndSwap();

  // Tick 1: advance enough to exceed ttl -> pendingKill
  bus.beginTick(1);
  bus.enterPhase(Phase.Simulation);
  sys.update(0.050);

  const p2 = store.get(projRef);
  assert(p2 !== null, "projectile still accessible before cleanup");
  assert(p2!.pendingKill === true, "projectile marked pendingKill after ttl");

  bus.enterPhase(Phase.Cleanup);
  store.cleanup();
  bus.endTickAndSwap();

  assert(store.get(projRef) === null, "projectile removed after cleanup");

  console.log("[SMOKE] ProjectileSystem OK ✅");
}

main();
