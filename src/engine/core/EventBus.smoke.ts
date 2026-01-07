 /**
  * EventBus smoke test (v3.1) – ownership-driven (no guessing)
  * Run: npm run smoke:eventbus
  */

 import { EventBus, Phase } from "./EventBus";
 import { CM_EVENT_OWNERSHIP } from "./EventOwnershipMap";
 import { EventType, type CMEventMap } from "./events";

 function assert(cond: unknown, msg: string): void {
   if (!cond) throw new Error("[SMOKE] " + msg);
 }

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

   bus.beginTick(0);

   // Phase Input
   bus.enterPhase(Phase.Input);
   assert(bus.drainPhase(Phase.Input).length === 0, "Input should drain nothing");

   // Director
   assert(owns(EventType.SPAWN_PROJECTILE) === Phase.Director, "SPAWN_PROJECTILE must be owned by Director for this test");

   bus.enterPhase(Phase.Director);
   bus.emit(EventType.SPAWN_PROJECTILE, {
     owner: { slot: 1, gen: 1 },
     origin: { x: 10, y: 20 },
     dir: { x: 1, y: 0 },
     weapon: "primary",
   });

   const directorEvents = bus.drainPhase(Phase.Director);
   assert(directorEvents.length === 1, "Director should drain exactly 1 spawn request");
   assert(directorEvents[0].type === EventType.SPAWN_PROJECTILE, "Wrong drained event type in Director");

   // Simulation
   bus.enterPhase(Phase.Simulation);
   bus.emit(EventType.PLAYER_FIRE_PRIMARY, { owner: { slot: 1, gen: 1 } });

   const simEvents = bus.drainPhase(Phase.Simulation);
   assert(simEvents.length === 1, "Simulation should drain PLAYER_FIRE_PRIMARY");
   assert(simEvents[0].type === EventType.PLAYER_FIRE_PRIMARY, "Wrong drained event type in Simulation");

   // Collision emits hit (owner is typically Impact)
   bus.enterPhase(Phase.Collision);
   bus.emit(EventType.PROJECTILE_HIT_ENEMY, {
     projectile: { slot: 2, gen: 1 },
     enemy: { slot: 3, gen: 1 },
   });

   // Collision must not drain if owned elsewhere
   const collisionEvents = bus.drainPhase(Phase.Collision);
   assert(collisionEvents.length === 0, "Collision should drain nothing if hit is owned elsewhere");

   // Drain hit in its owner phase
   const hitOwner = owns(EventType.PROJECTILE_HIT_ENEMY);
   drainAndAssert(bus, hitOwner, [EventType.PROJECTILE_HIT_ENEMY]);

   // Emit derived events
   bus.emit(EventType.ENTITY_DAMAGED, {
     entity: { slot: 3, gen: 1 },
     amount: 999,
     source: "projectile",
   });

   bus.emit(EventType.ENTITY_KILLED, {
     entity: { slot: 3, gen: 1 },
     source: "projectile",
   });

   // ✅ Drain by unique owners (handles “same owner” correctly)
   const damagedOwner = owns(EventType.ENTITY_DAMAGED);
   const killedOwner = owns(EventType.ENTITY_KILLED);

   const phaseToTypes = new Map<Phase, Array<keyof CMEventMap>>();
   phaseToTypes.set(damagedOwner, [EventType.ENTITY_DAMAGED]);
   phaseToTypes.set(killedOwner, [...(phaseToTypes.get(killedOwner) ?? []), EventType.ENTITY_KILLED]);

   for (const [phase, types] of phaseToTypes.entries()) {
     drainAndAssert(bus, phase, types);
   }

   // Cleanup/end
   bus.enterPhase(Phase.Cleanup);
   bus.endTickAndSwap();

   console.log("[SMOKE] EventBus v3.1 OK ✅");
 }

 main();