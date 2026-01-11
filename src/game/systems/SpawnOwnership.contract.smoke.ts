// src/game/systems/SpawnOwnership.contract.smoke.ts
import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";

// ---- tiny assert helper (no node:assert)
function fail(msg: string): never {
  throw new Error("[SMOKE] " + msg);
}

const assert = {
  ok(cond: unknown, msg = "assert.ok failed"): void {
    if (!cond) fail(msg);
  },
  equal<T>(a: T, b: T, msg = "assert.equal failed"): void {
    if (a !== b) fail(`${msg} (got=${String(a)} expected=${String(b)})`);
  },
};

function mustThrow(fn: () => void, contains: string) {
  let ok = false;
  try {
    fn();
  } catch (e: any) {
    ok = String(e?.message ?? e).includes(contains);
  }
  assert.ok(ok, `expected throw containing "${contains}"`);
}

function main() {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,

    // ✅ Contract test intentionally triggers errors — keep output clean.
    onWarn: () => {},
    onError: () => {},
  });

  bus.beginTick(0);

  // SPAWN_* are Simulation-owned => emit() is only legal in Phase.Simulation.
  bus.enterPhase(Phase.Director);

  mustThrow(() => bus.emit(EventType.SPAWN_ENEMY, { typeId: "red" } as any),
    "emit(SPAWN_ENEMY)"
  );
  mustThrow(
    () =>
      bus.emit(EventType.SPAWN_PROJECTILE, {
        owner: { slot: 1, gen: 1 },
        origin: { x: 0, y: 0 },
        dir: { x: 1, y: 0 },
        weapon: "primary",
      } as any),
    "emit(SPAWN_PROJECTILE)"
  );

  mustThrow(
    () =>
      bus.emit(EventType.SPAWN_BOMB, {
        owner: { slot: 1, gen: 1 },
        origin: { x: 0, y: 0 },
        target: { x: 10, y: 10 },
      } as any),
    "emit(SPAWN_BOMB)"
  );

  // ✅ Legal usage: emitNext from Director (one-tick delay)
  bus.enterPhase(Phase.Director);
  bus.emitNext(EventType.SPAWN_ENEMY, { typeId: "red" } as any);
  bus.emitNext(EventType.SPAWN_PROJECTILE, {
    owner: { slot: 1, gen: 1 },
    origin: { x: 0, y: 0 },
    dir: { x: 1, y: 0 },
    weapon: "primary",
  } as any);
  bus.emitNext(EventType.SPAWN_BOMB, {
    owner: { slot: 1, gen: 1 },
    origin: { x: 0, y: 0 },
    target: { x: 10, y: 10 },
  } as any);

  // swap to tick1 (where these become qNow)
  bus.enterPhase(Phase.Cleanup);

  const q0 = bus.getQueueSizes();
  console.log("[SMOKE][tick0][pre-swap] qNow/qNext =", q0.now, q0.next);

  bus.endTickAndSwap();
  
  // Now in tick1, Simulation drains them.
  bus.enterPhase(Phase.Simulation);
  const simEvents = bus.drainPhase(Phase.Simulation);

  const q1 = bus.getQueueSizes();
  console.log("[SMOKE][tick1][post-swap] qNow/qNext =", q1.now, q1.next);
  
  // Assert we got the 3 expected SPAWN_* types (order not guaranteed)
  const types = simEvents.map(e => String(e.type)).sort();
  assert.equal(types.length, 3, "tick1: Simulation must see 3 spawn events");
  assert.ok(types.includes(String(EventType.SPAWN_ENEMY)), "tick1: missing SPAWN_ENEMY");
  assert.ok(types.includes(String(EventType.SPAWN_PROJECTILE)), "tick1: missing SPAWN_PROJECTILE");
  assert.ok(types.includes(String(EventType.SPAWN_BOMB)), "tick1: missing SPAWN_BOMB");
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] SpawnOwnership.contract OK ✅");
}

main();