/**
 * EventBus smoke test (v3.1) – ownership-driven (no guessing)
 * Run: npm run smoke:eventbus
 */

import { EventBus, Phase } from "./EventBus";
import { CM_EVENT_OWNERSHIP } from "./EventOwnershipMap";
import { EventType, type CMEventMap } from "./events";
import type { EntityRef } from "../ecs/EntityRef";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

// NOTE: we only need type/payload fields for the asserts here
type AnyEvent = { type: keyof CMEventMap; payload: CMEventMap[keyof CMEventMap] };

function owns(type: keyof CMEventMap): Phase {
  return CM_EVENT_OWNERSHIP[type];
}

function drainAndAssert(
  bus: EventBus<CMEventMap>,
  phase: Phase,
  expectedTypes: Array<keyof CMEventMap>,
) {
  bus.enterPhase(phase);
  const events = bus.drainPhase(phase) as AnyEvent[];

  for (const t of expectedTypes) {
    assert(
      events.some((e) => e.type === t),
      `Owner phase (${Phase[phase]}) must drain ${String(t)}`,
    );
  }

  return events;
}

function main(): void {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  const ship: EntityRef = { slot: 1, gen: 1 };

  // Tick 0
  bus.beginTick(0);

  // Phase Input
  bus.enterPhase(Phase.Input);
  assert(bus.drainPhase(Phase.Input).length === 0, "Input should drain nothing");

  // --- Schedule "next tick" spawn requests in any phase
  // emitNext queues into NEXT tick's owner phase (per CM_EVENT_OWNERSHIP)
  bus.enterPhase(Phase.Simulation);

  bus.emitNext(EventType.SPAWN_PROJECTILE, {
    owner: ship,
    origin: { x: 10, y: 20 },
    dir: { x: 1, y: 0 },
    weapon: "primary",
  });

  bus.emitNext(EventType.SPAWN_BOMB, {
    owner: ship,
    origin: { x: 10, y: 20 },
    target: { x: 60, y: 20 },
  });

  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  // Tick 1
  bus.beginTick(1);

  // ✅ Spawn events must appear in THEIR OWNER phase in tick 1
  const spawnOwner = owns(EventType.SPAWN_PROJECTILE);
  const bombOwner = owns(EventType.SPAWN_BOMB);

  // drain all owners involved (handles "same owner" correctly)
  const phaseToTypes = new Map<Phase, Array<keyof CMEventMap>>();
  phaseToTypes.set(spawnOwner, [EventType.SPAWN_PROJECTILE]);
  phaseToTypes.set(bombOwner, [...(phaseToTypes.get(bombOwner) ?? []), EventType.SPAWN_BOMB]);

  for (const [phase, types] of phaseToTypes.entries()) {
    drainAndAssert(bus, phase, types);
  }

  // --- Immediate event in Simulation
  bus.enterPhase(Phase.Simulation);
  bus.emit(EventType.PLAYER_FIRE_PRIMARY, { owner: ship });

  // must drain in its owner phase (usually Simulation)
  drainAndAssert(bus, owns(EventType.PLAYER_FIRE_PRIMARY), [EventType.PLAYER_FIRE_PRIMARY]);

  // --- Hit event: emitted in Collision, owned elsewhere (Impact)
  bus.enterPhase(Phase.Collision);
  bus.emit(EventType.PROJECTILE_HIT_ENEMY, {
    projectile: { slot: 2, gen: 1 },
    enemy: { slot: 3, gen: 1 },
  });

  // Collision must not drain if owned elsewhere
  const collisionEvents = bus.drainPhase(Phase.Collision);
  assert(collisionEvents.length === 0, "Collision should drain nothing if hit is owned elsewhere");

  // drain hit in its owner phase
  drainAndAssert(bus, owns(EventType.PROJECTILE_HIT_ENEMY), [EventType.PROJECTILE_HIT_ENEMY]);

  // --- Derived Flow events (schema must match events.ts!)
  bus.enterPhase(Phase.Flow);

  bus.emit(EventType.ENTITY_DAMAGED, {
    target: { slot: 3, gen: 1 },
    amount: 999,
    hpAfter: 0,
    source: "projectile",
  });

  bus.emit(EventType.ENTITY_KILLED, {
    target: { slot: 3, gen: 1 },
    source: "projectile",
    isPlayer: false,
  });

  // drain by unique owners
  const damagedOwner = owns(EventType.ENTITY_DAMAGED);
  const killedOwner = owns(EventType.ENTITY_KILLED);

  const phaseToTypes2 = new Map<Phase, Array<keyof CMEventMap>>();
  phaseToTypes2.set(damagedOwner, [EventType.ENTITY_DAMAGED]);
  phaseToTypes2.set(killedOwner, [...(phaseToTypes2.get(killedOwner) ?? []), EventType.ENTITY_KILLED]);

  for (const [phase, types] of phaseToTypes2.entries()) {
    drainAndAssert(bus, phase, types);
  }

  // Cleanup/end
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] EventBus v3.1 OK ✅");
}

main();