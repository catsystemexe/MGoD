import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";

import { DirectorSystem } from "./DirectorSystem";
import { DIRECTOR_DEFS_MVP } from "../defs/DirectorDefs";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

type TestEntity = { kind: "enemy"; pendingKill: boolean } | { kind: "other" };

function main() {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  const store = new EntityStore<TestEntity>(64);

  const director = new DirectorSystem(bus, store, DIRECTOR_DEFS_MVP, { enabled: true });

  // Tick 0 at t=0 -> should emit SPAWN_ENEMY
  bus.beginTick(0);
  bus.enterPhase(Phase.Director);
  director.update({ timeSec: 0, tick: 0 });

  const ev0 = bus.drainPhase(Phase.Director);
  const spawn0 = ev0.filter(e => e.type === EventType.SPAWN_ENEMY);
  assert(spawn0.length === 1, "should spawn 1 enemy at t=0");

  // If we call again at same time -> no new spawn due to interval
  director.update({ timeSec: 0, tick: 0 });
  const ev0b = bus.drainPhase(Phase.Director);
  assert(ev0b.length === 0, "should NOT spawn twice at same t due to cadence");

  // Advance time less than interval (2.0s in wave1) -> still no spawn
  director.update({ timeSec: 1.0, tick: 60 });
  const ev1 = bus.drainPhase(Phase.Director);
  assert(ev1.length === 0, "should not spawn before interval");

  // Advance beyond interval -> should spawn again
  director.update({ timeSec: 2.1, tick: 126 });
  const ev2 = bus.drainPhase(Phase.Director);
  assert(ev2.filter(e => e.type === EventType.SPAWN_ENEMY).length === 1, "should spawn after interval");

  // Cap test: create maxAlive enemies
  for (let i = 0; i < 6; i++) {
    store.spawn(e => { e.kind = "enemy"; (e as any).pendingKill = false; });
  }

  director.update({ timeSec: 4.5, tick: 270 });
  const evCap = bus.drainPhase(Phase.Director);
  assert(evCap.length === 0, "should not spawn when maxAlive cap reached");

  // End tick cleanly
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] DirectorSystem OK ✅");
}

main();
