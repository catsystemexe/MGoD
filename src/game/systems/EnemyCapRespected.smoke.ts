import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { EntityStore } from "../../engine/ecs/EntityStore";
import { DIRECTOR_DEFS_MVP } from "../defs/DirectorDefs";
import { DirectorSystem } from "./DirectorSystem";
import { SpawnSystem } from "./SpawnSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function tick(bus: EventBus<CMEventMap>, phase: Phase, t: number, fn: (events: any[]) => void) {
  bus.enterPhase(phase);
  const events = bus.drainPhase(phase) as any[];
  fn(events);
}

function countEnemies(store: EntityStore<any>): number {
  let n = 0;
  store.debugForEachAlive((_ref, e: any) => { if (e.kind === "enemy") n++; });
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

  const store = new EntityStore<any>(64);

  const spawn = new SpawnSystem(store as any, {
    rng01: () => 0.5,
    logicSize: { w: 224, h: 256 },
    projectile: {
      primary: { speed: 100, ttlSec: 1, damage: 1, radius: 1 },
      secondary: { speed: 100, ttlSec: 1, damage: 1, radius: 1 },
    },
    bomb: { travelSec: 1, damage: 1, radius: 1, ttlSec: 1 },
  });

  const director = new DirectorSystem(bus, store as any, DIRECTOR_DEFS_MVP);

  const dt = 1/60;
  let timeSec = 0;

  for (let t = 0; t < 240; t++) { // ~4s
    bus.beginTick(t);
    timeSec += dt;

    // Director decides emitNext spawns
    tick(bus, Phase.Director, t, (events) => {
      director.update({ tick: t, timeSec });
      spawn.update({ tick: t, dt }, events as any);
    });

    tick(bus, Phase.Cleanup, t, () => store.cleanup());
    bus.endTickAndSwap();
  }

  const alive = countEnemies(store);
  const cap = DIRECTOR_DEFS_MVP.waves[0].maxAlive;
  assert(alive <= cap, `enemy count must not exceed cap (${alive} <= ${cap})`);

  console.log("[SMOKE] EnemyCapRespected OK ✅");
}

main();
