import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { CAImpactSystem } from "./CAImpactSystem";

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

  // CA stub: each explosion kills 10 cells
  const ca = {
    applyExplosion: (_x: number, _y: number, _r: number) => 10,
  };

  const sys = new CAImpactSystem(bus, ca, { explosionRadius: 3 });

  bus.beginTick(0);

  // ✅ emit detections (owned by Impact, but emitted during Collision)
  bus.enterPhase(Phase.Collision);
  bus.emit(EventType.PROJECTILE_HIT_CA, { projectile: { slot: 1, gen: 1 }, x: 10, y: 10 });
  bus.emit(EventType.PROJECTILE_HIT_CA, { projectile: { slot: 2, gen: 1 }, x: 11, y: 11 });

  // ✅ process in Impact
  bus.enterPhase(Phase.Impact);
  sys.update();

  // ✅ CA_CELLS_KILLED owned by Flow => drain in Flow
  bus.enterPhase(Phase.Flow);
  const flowEvents = bus.drainPhase(Phase.Flow);

  const killed = flowEvents.filter((e) => e.type === EventType.CA_CELLS_KILLED);
  assert(killed.length === 1, "Must emit exactly one CA_CELLS_KILLED event");
  assert(killed[0].payload.count === 20, "Batched count must be 20");

  console.log("[SMOKE] CAImpactSystem OK ✅");
}

main();