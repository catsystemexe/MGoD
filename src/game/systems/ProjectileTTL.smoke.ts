import { EventBus } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import type { CMEventMap } from "../../engine/core/events";

import { EntityStore } from "../../engine/ecs/EntityStore";
import { ProjectileSystem, type ProjectileLike } from "./ProjectileSystem";

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

  const store = new EntityStore<any>(32);
  const projSys = new ProjectileSystem(bus, store);

  // Spawn 3 projectiles with ttl 0.10s
  for (let i = 0; i < 3; i++) {
    store.spawn((e: any) => {
      e.kind = "projectile";
      e.pos = { x: 0, y: 0 };
      e.vel = { x: 10, y: 0 };
      e.ttl = 0.10;
      e.pendingKill = false;
      e.consumed = false;
    });
  }

  assert(store.getAliveCount() === 3, "alive should be 3 after spawn");

  // Simulate: 10 ticks at 1/60 sec ~ 0.166s total => ttl should expire
  const dt = 1 / 60;
  for (let t = 0; t < 10; t++) {
    projSys.update(dt);
    store.cleanup(); // commit kills each tick (like Cleanup phase)
  }

  const alive = store.getAliveCount();
  console.log("[SMOKE] alive after ticks:", alive);

  assert(alive === 0, "all projectiles should be cleaned up after ttl expired");

  console.log("[SMOKE] ProjectileTTL OK ✅");
}

main();
