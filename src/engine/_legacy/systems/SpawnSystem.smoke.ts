/**
 * SpawnSystem smoke test – CM v3.1+
 * Run: npm run smoke:spawn
 */

import { EventBus, Phase } from "../../core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../core/events";
import { EntityStore } from "../../ecs/EntityStore";
import type { EntityRef } from "../../ecs/EntityRef";

// SpawnSystem.ts je v src/engine/_legacy/SpawnSystem.ts
import { SpawnSystem, type SpawnableEntity, type SpawnSystemConfig } from "../SpawnSystem";

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

  // ✅ IMPORTANT: cfg MUST include rng01 + logicSize
  const cfg = {
    rng01: () => 0.5, // deterministic
    logicSize: { w: 400, h: 224 },

    projectile: {
      primary: { speed: 200, ttlSec: 1.0, damage: 3, radius: 2 },
      secondary: { speed: 140, ttlSec: 1.2, damage: 7, radius: 3 },
    },

    bomb: { travelSec: 0.25, damage: 20, radius: 10, ttlSec: 0.25 },
  } satisfies SpawnSystemConfig;

  const spawn = new SpawnSystem(bus, store, {
    rng01: () => 0.5,                  // ✅ deterministic
    logicSize: { w: 400, h: 224 },      // ✅ required
    projectile: {
      primary: { speed: 200, ttlSec: 1.0, damage: 3, radius: 2 },
      secondary: { speed: 140, ttlSec: 1.2, damage: 7, radius: 3 },
    },
    bomb: { travelSec: 0.25, damage: 20, radius: 10, ttlSec: 0.25 },
  });
  const ship: EntityRef = { slot: 1, gen: 1 };

  bus.beginTick(0);

  // Emit spawn requests into Director-owned queue (same tick)
  bus.enterPhase(Phase.Director);

  bus.emit(EventType.SPAWN_PROJECTILE, {
    owner: ship,
    origin: { x: 10, y: 20 },
    dir: { x: 1, y: 0 },
    weapon: "primary",
  });

  bus.emit(EventType.SPAWN_BOMB, {
    owner: ship,
    origin: { x: 10, y: 20 },
    target: { x: 100, y: 50 },
  });

  // Enemy payload MUST be { typeId }
  bus.emit(EventType.SPAWN_ENEMY, {
    typeId: "enemy.drone", // uprav podle tvého EnemyDefs klíče
  });

  spawn.update();

  let alive = 0, proj = 0, bomb = 0, enemy = 0;

  store.debugForEachAlive((_ref, e) => {
    alive++;
    if (e.kind === "projectile") proj++;
    if (e.kind === "bomb") bomb++;
    if (e.kind === "enemy") enemy++;
  });

  assert(alive === 3, "should spawn exactly 3 entities");
  assert(proj === 1, "should spawn 1 projectile");
  assert(bomb === 1, "should spawn 1 bomb");
  assert(enemy === 1, "should spawn 1 enemy");

  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] SpawnSystem OK ✅");
}

main();