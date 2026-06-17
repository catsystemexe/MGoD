import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { AnyEvent, TickContext } from "../../engine/core/Loop";

import { SpawnSystem, type SpawnableEntity } from "./SpawnSystem";
import { createWorldState } from "../data/WorldState";

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

  const store = new EntityStore<SpawnableEntity>(32);

  const spawn = new SpawnSystem(
    store,
    {
      rng01: () => 0.5,
      logicSize: { w: 400, h: 224 },
      weaponDb: {
        primary: { id: "primary", cooldownSec: 0, projectile: { speed: 200, ttlSec: 1.0, damage: 3, radius: 2 } },
        secondary: { id: "secondary", cooldownSec: 0, projectile: { speed: 140, ttlSec: 1.2, damage: 7, radius: 3 } },
      },
      bomb: { travelSec: 0.25, damage: 20, radius: 10, ttlSec: 0.25 },
    },
    createWorldState(),
  );

  const ship: EntityRef = { slot: 1, gen: 1 };

  // -----------------------
  // Tick 0: emitNext → next tick (owned by SIMULATION
  // -----------------------
  bus.beginTick(0);
  bus.enterPhase(Phase.Simulation);

  bus.emitNext(EventType.SPAWN_PROJECTILE, {
    owner: ship,
    origin: { x: 10, y: 20 },
    dir: { x: 1, y: 0 },
    weaponTypeId: "primary",
  });

  bus.emitNext(EventType.SPAWN_BOMB, {
    owner: ship,
    origin: { x: 10, y: 20 },
    target: { x: 100, y: 50 },
  });

  bus.emitNext(EventType.SPAWN_ENEMY, {
    typeId: "red", // <-- dosaď existující
  });

  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  // -----------------------
  // Tick 1: Director drains and SpawnSystem consumes events
  // -----------------------
  bus.beginTick(1);
  bus.enterPhase(Phase.Simulation);

  const ctx: TickContext = { tick: 1, dt: 1 / 60 };
  const events = bus.drainPhase(Phase.Simulation) as AnyEvent<CMEventMap>[];
  spawn.update(ctx, events);

  let projCount = 0;
  let bombCount = 0;
  let enemyCount = 0;

  store.debugForEachAlive((_ref, e) => {
    if (e.kind === "projectile") projCount++;
    if (e.kind === "bomb") bombCount++;
    if (e.kind === "enemy") enemyCount++;
  });

  assert(projCount === 1, "should spawn 1 projectile");
  assert(bombCount === 1, "should spawn 1 bomb");
  assert(enemyCount === 1, "should spawn 1 enemy");

  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] SpawnSystem OK ✅");
}

main();