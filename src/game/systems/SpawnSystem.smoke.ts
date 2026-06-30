import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { AnyEvent, TickContext } from "../../engine/core/Loop";

import { SpawnSystem, type SpawnableEntity } from "./SpawnSystem";
import { createWorldState } from "../data/WorldState";
import { WEAPON_DB } from "../defs/WeaponDB";
import {
  W1_SPREAD_ORB_COLLISION_RADIUS_BY_LEVEL,
  W1_SPREAD_ORB_SIZE_BY_LEVEL,
} from "../weapons/W1Geometry";

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

  for (let weaponLevel = 1; weaponLevel <= 5; weaponLevel++) {
    bus.emitNext(EventType.SPAWN_PROJECTILE, {
      owner: ship,
      origin: { x: 10, y: 20 + weaponLevel * 5 },
      dir: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
      weaponTypeId: "w1.spread",
      weaponLevel,
    });
  }

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

  assert(projCount === 6, "should spawn 6 projectiles including five Spread materialization levels");
  const expectedSizes = W1_SPREAD_ORB_SIZE_BY_LEVEL;
  const expectedRadii = W1_SPREAD_ORB_COLLISION_RADIUS_BY_LEVEL;
  const foundSpreadLevels = new Set<number>();
  const seenSizes: number[] = [];
  store.debugForEachAlive((_ref, e: any) => {
    if (e.kind !== "projectile" || e.weaponTypeId !== "w1.spread") return;
    const weaponLevel = Math.round((Number(e.pos.y) - 20) / 5) as keyof typeof expectedSizes;
    foundSpreadLevels.add(weaponLevel);
    const expectedSize = expectedSizes[weaponLevel];
    const expectedRadius = expectedRadii[weaponLevel];
    seenSizes.push(Number(e.render?.sdf?.lengthPx));
    assert(e.damage === 2, "Spread spawn damage comes from definition");
    assert(Math.abs(Math.hypot(e.vel.x, e.vel.y) - 980) < 1e-9, "Spread spawn speed comes from definition");
    assert(Math.abs(e.ttl - 1.15) < 1e-9, "Spread spawn TTL comes from definition");
    assert(e.radius === expectedRadius, `Spread L${weaponLevel} spawn radius comes from level materialization`);
    assert(e.render?.sdf?.shape === "plasmaOrb", "Spread render uses plasmaOrb SDF shape");
    assert(e.render?.sdf?.color === "#ffd21f", "Spread render body color is yellow");
    assert(e.render?.sdf?.tipColor === "#ff8a00", "Spread render tip color is orange");
    assert(e.render?.sdf?.lengthPx === expectedSize, `Spread L${weaponLevel} render length should use the level orb size`);
    assert(e.render?.sdf?.widthPx === expectedSize, `Spread L${weaponLevel} render width should match the level orb size`);
    assert(e.render?.sdf?.lengthPx === e.render?.sdf?.widthPx, `Spread L${weaponLevel} should render as a square orb`);
  });
  const sortedSizes = seenSizes.slice().sort((a, b) => a - b);
  for (let i = 1; i < sortedSizes.length; i++) {
    assert(sortedSizes[i] > sortedSizes[i - 1], "Spread orb sizes should be strictly increasing by level");
    const ratio = sortedSizes[i] / sortedSizes[i - 1];
    assert(ratio >= 1.15 && ratio <= 1.25, "Spread orb size steps should stay near +20% after rounding");
  }
  assert(JSON.stringify([...foundSpreadLevels].sort()) === JSON.stringify([1, 2, 3, 4, 5]), "should materialize Spread projectile levels L1-L5");
  assert(bombCount === 1, "should spawn 1 bomb");
  assert(enemyCount === 1, "should spawn 1 enemy");

  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] SpawnSystem OK ✅");
}

main();
