import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";

import { DirectorSystem } from "./DirectorSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

type TestEntity = any;

const TEST_DEFS: any = {
  globalMaxAlive: 999,
  waves: [
    {
      id: "wave.test",
      trigger: { kind: "time", startSec: 0, endSec: 999 },
      spawnEverySec: 1.0,     // jistota: dt=1.1 => min 1 spawn
      maxAlive: 999,
      enemyTypeId: "enemy.test",
      behaviorPresetId: "none.basic",
    },
  ],
};

function main() {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
  });

  const store = new EntityStore<TestEntity>(64);

  const director = new DirectorSystem(
    bus as any,
    TEST_DEFS,
    {
      getAliveEnemies: () => 0,
      getAliveEnemiesForWave: () => 0,
    }
  );

  // ─────────────────────────────────────
  // Tick 0: Director emitNext -> event až v tick 1
  // ─────────────────────────────────────
  bus.beginTick(0);
  bus.enterPhase(Phase.Director);

  director.update({ tick: 0, dt: 1.1 } as any);

  // Director NIC nedrainuje (SPAWN_* owner = Simulation)
  const dir0 = bus.drainPhase(Phase.Director);
  assert(dir0.length === 0, "Director must not drain spawn");

  // Simulation v tick 0 NIC (protože emitNext)
  bus.enterPhase(Phase.Simulation);
  const sim0 = bus.drainPhase(Phase.Simulation);
  assert(sim0.length === 0, "no spawn in same tick (emitNext)");

  // End tick 0 (qNow musí být prázdné)
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  // ─────────────────────────────────────
  // Tick 1: spawn je v qNow a drainuje ho Simulation
  // ─────────────────────────────────────
  bus.beginTick(1);

  // (volitelně Director s malým dt, aby negeneroval další emitNext)
  bus.enterPhase(Phase.Director);
  director.update({ tick: 1, dt: 0.0001 } as any);
  const dir1 = bus.drainPhase(Phase.Director);
  assert(dir1.length === 0, "Director must not drain spawn (tick 1)");

  bus.enterPhase(Phase.Simulation);
  const sim1 = bus.drainPhase(Phase.Simulation);
  assert(
    sim1.filter(e => e.type === EventType.SPAWN_ENEMY).length >= 1,
    "spawn must be drained in Simulation phase"
  );

  // End tick 1
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] DirectorSystem OK ✅");
}

main();
