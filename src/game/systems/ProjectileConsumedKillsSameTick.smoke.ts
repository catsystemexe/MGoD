import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import type { CMEventMap } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
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

  const store = new EntityStore<any>(16);
  const projSys = new ProjectileSystem(bus, store);

  // spawn projectile that is already consumed
  store.spawn((e: any) => {
    e.kind = "projectile";
    e.pos = { x: 0, y: 0 };
    e.vel = { x: 0, y: 0 };
    e.ttl = 999;
    e.consumed = true;
    e.pendingKill = false;
  });

  bus.beginTick(0);

  bus.enterPhase(Phase.Simulation);
  projSys.update(1/60);

  bus.enterPhase(Phase.Cleanup);
  store.cleanup();

  bus.endTickAndSwap();

  assert(store.getAliveCount() === 0, "consumed projectile should be removed after cleanup in same tick");
  console.log("[SMOKE] ProjectileConsumedKillsSameTick OK ✅");
}

main();
