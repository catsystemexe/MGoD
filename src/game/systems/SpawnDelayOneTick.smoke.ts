import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
import { SpawnSystem } from "./SpawnSystem";
import { createWorldState } from "../data/WorldState";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function tick(bus: EventBus<CMEventMap>, phase: Phase, fn: (events: any[]) => void) {
  bus.enterPhase(phase);
  const events = bus.drainPhase(phase) as any[];
  fn(events);
}

function countProjectiles(store: EntityStore<any>): number {
  let n = 0;
  store.debugForEachAlive((_ref, e: any) => {
    if (e.kind === "projectile") n++;
  });
  return n;
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

  const spawn = new SpawnSystem(
    store as any,
    {
      rng01: () => 0.5,
      logicSize: { w: 224, h: 256 },
      weaponDb: {
        primary: { id: "primary", cooldownSec: 0, projectile: { speed: 100, ttlSec: 1, damage: 1, radius: 1 } },
        secondary: { id: "secondary", cooldownSec: 0, projectile: { speed: 100, ttlSec: 1, damage: 1, radius: 1 } },
      },
      bomb: { travelSec: 1, damage: 1, radius: 1, ttlSec: 1 },
    },
    createWorldState(),
  );

  // -----------------------
  // Tick 0: emitNext -> should NOT spawn in the same tick
  // Owner of SPAWN_PROJECTILE is Simulation, but event is in qNext anyway.
  // -----------------------
  bus.beginTick(0);

  tick(bus, Phase.Simulation, () => {
    bus.emitNext(EventType.SPAWN_PROJECTILE, {
      owner: { slot: 1, gen: 0 },
      origin: { x: 10, y: 10 },
      dir: { x: 1, y: 0 },
      weaponTypeId: "primary",
    });
  });

  tick(bus, Phase.Cleanup, () => store.cleanup());
  bus.endTickAndSwap();

  assert(countProjectiles(store) === 0, "tick0: projectile must NOT spawn yet (emitNext delay)");

  // -----------------------
  // Tick 1: qNext -> qNow; Simulation drains SPAWN_PROJECTILE and SpawnSystem materializes it
  // -----------------------
  bus.beginTick(1);

  tick(bus, Phase.Simulation, (events) => {
    spawn.update({ tick: 1, dt: 1 / 60 }, events as any);
  });

  tick(bus, Phase.Cleanup, () => store.cleanup());
  bus.endTickAndSwap();

  assert(countProjectiles(store) === 1, "tick1: projectile must spawn (delayed from tick0)");

  console.log("[SMOKE] SpawnDelayOneTick OK ✅");
}

main();
