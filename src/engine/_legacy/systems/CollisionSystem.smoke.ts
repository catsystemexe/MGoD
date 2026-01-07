import { EventBus, Phase } from "../core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../core/events";
import { EntityFlag } from "../ecs/ComponentTypes";
import { CollisionSystem, type CAQuery, type CollidableEnemy, type CollidableProjectile } from "./CollisionSystem";

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

  // CA says "hit always" -> forces the Enemy>CA priority test
  const ca: CAQuery = {
    hitTestCircle: () => true,
  };

  const p: CollidableProjectile = {
    ref: { slot: 1, gen: 1 },
    alive: true,
    pendingKill: false,
    flags: 0,
    x: 0,
    y: 0,
    r: 1,
  };

  const e: CollidableEnemy = {
    ref: { slot: 2, gen: 1 },
    alive: true,
    pendingKill: false,
    x: 0, // overlap with projectile
    y: 0,
    r: 1,
  };

  const sys = new CollisionSystem(
    bus,
    ca,
    () => [p],
    () => [e],
  );

  bus.beginTick(0);

  // Run in collision phase
  bus.enterPhase(Phase.Collision);
  sys.update();

  // Collision events are owned by Impact -> should not drain in collision
  const drainedCollision = bus.drainPhase(Phase.Collision);
  assert(drainedCollision.length === 0, "Collision phase should not drain impact-owned events");

  // Impact should see exactly 1 hit, and it must be enemy (priority)
  bus.enterPhase(Phase.Impact);
  const impactEvents = bus.drainPhase(Phase.Impact);
  assert(impactEvents.length === 1, "Impact must receive exactly one hit event");
  assert(impactEvents[0].type === EventType.PROJECTILE_HIT_ENEMY, "Enemy must win over CA");

  // projectile consumed
  assert((p.flags & EntityFlag.Consumed) !== 0, "Projectile must be marked consumed");

  // Running again in same tick should not emit again
  bus.enterPhase(Phase.Collision);
  sys.update();

  bus.enterPhase(Phase.Impact);
  const impactEvents2 = bus.drainPhase(Phase.Impact);
  assert(impactEvents2.length === 0, "Consumed projectile must not emit a second hit");

  // end tick
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] CollisionSystem OK ✅");
}

main();
