import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { AnyEvent, TickContext } from "../../engine/core/Loop";

import { SpawnSystem, type SpawnableEntity } from "./SpawnSystem";
import { createWorldState } from "../data/WorldState";
import { WEAPON_DB } from "../defs/WeaponDB";

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
        ...WEAPON_DB,
        primary: { id: "primary", cooldownSec: 0, fireKind: "projectile", projectile: { speed: 200, ttlSec: 1.0, damage: 3, radius: 2 } },
        secondary: { id: "secondary", cooldownSec: 0, fireKind: "projectile", projectile: { speed: 140, ttlSec: 1.2, damage: 7, radius: 3 } },
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

  bus.emitNext(EventType.SPAWN_PROJECTILE, {
    owner: ship,
    origin: { x: 10, y: 25 },
    dir: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    weaponTypeId: "w1.spread",
    weaponLevel: 5,
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

  assert(projCount === 2, "should spawn 2 projectiles including Spread");
  let foundSpread = false;
  store.debugForEachAlive((_ref, e: any) => {
    if (e.kind !== "projectile" || e.weaponTypeId !== "w1.spread") return;
    foundSpread = true;
    assert(e.damage === 2, "Spread spawn damage comes from definition");
    assert(Math.abs(Math.hypot(e.vel.x, e.vel.y) - 980) < 1e-9, "Spread spawn speed comes from definition");
    assert(Math.abs(e.ttl - 1.15) < 1e-9, "Spread spawn TTL comes from definition");
    assert(e.radius === 6.5, "Spread L5 spawn radius grows for thick body");
    assert(e.render?.sdf?.shape === "bolt", "Spread render keeps bolt SDF shape");
    assert(e.render?.sdf?.color === "#ffd21f", "Spread render body color is yellow");
    assert(e.render?.sdf?.tipColor === "#ff8a00", "Spread render tip color is orange");
    assert(e.render?.sdf?.lengthPx === 34, "Spread render is about one-third Basic length");
    assert(e.render?.sdf?.widthPx === 13, "Spread L5 render is thicker than L1-L4");
  });
  assert(foundSpread, "should materialize Spread projectile");
  assert(bombCount === 1, "should spawn 1 bomb");
  assert(enemyCount === 1, "should spawn 1 enemy");

  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] SpawnSystem OK ✅");
}

main();