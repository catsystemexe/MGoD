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
    applyExplosion: () => 10,
  };

  const sys = new CAImpactSystem(bus, ca, { explosionRadius: 3 });

  bus.beginTick(0);

  // Two CA hits in same tick
  bus.enterPhase(Phase.Collision);
  bus.emit(EventType.PROJECTILE_HIT_CA, { projectile: { slot: 1, gen: 1 }, x: 10, y: 10 });
  bus.emit(EventType.PROJECTILE_HIT_CA, { projectile: { slot: 2, gen: 1 }, x: 11, y: 11 });

  bus.enterPhase(Phase.Impact);
  sys.update();

  // We expect ONE batched CA_CELLS_KILLED event (count 20)
  // Depending on ownership map, this event may be owned by Flow or Impact.
  // We'll check by draining BOTH phases if needed (safe for smoke).
  const flowEvents = bus.drainPhase(Phase.Flow);
  const impactEvents = bus.drainPhase(Phase.Impact);

  const all = [...flowEvents, ...impactEvents];
  const killed = all.filter(e => e.type === EventType.CA_CELLS_KILLED);

  assert(killed.length === 1, "Must emit exactly one CA_CELLS_KILLED event");
  assert((killed[0].payload as any).count === 20, "Batched count must be 20");

  console.log("[SMOKE] CAImpactSystem OK ✅");
}

main();
