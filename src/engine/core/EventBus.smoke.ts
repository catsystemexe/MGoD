/**
 * EventBus smoke test (v3.1) – ESM-safe
 * Run: npm run smoke:eventbus
 */

import { EventBus, Phase } from "./EventBus";
import { CM_EVENT_OWNERSHIP } from "./EventOwnershipMap";
import { EventType, type CMEventMap } from "./events";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function main(): void {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  // ---- Begin Tick 0
  bus.beginTick(0);

  // Phase 0: Input (no events)
  bus.enterPhase(Phase.Input);
  assert(bus.drainPhase(Phase.Input).length === 0, "Input should drain nothing");

  // Phase 1: Director/Spawn
  bus.enterPhase(Phase.Director);
  bus.emit(EventType.SPAWN_ENEMY, { defId: "enemy.drone", x: 10, y: 20 });
  const directorEvents = bus.drainPhase(Phase.Director);
  assert(directorEvents.length === 1, "Director should drain SPAWN_ENEMY");
  assert(directorEvents[0].type === EventType.SPAWN_ENEMY, "Wrong drained event type");

  // Phase 2: Simulation
  bus.enterPhase(Phase.Simulation);
  bus.emit(EventType.PLAYER_FIRE_PRIMARY, { player: { slot: 1, gen: 1 } });
  const simEvents = bus.drainPhase(Phase.Simulation);
  assert(simEvents.length === 1, "Simulation should drain PLAYER_FIRE_PRIMARY");

  // Phase 3: Collision
  bus.enterPhase(Phase.Collision);
  bus.emit(EventType.PROJECTILE_HIT_ENEMY, {
    projectile: { slot: 2, gen: 1 },
    enemy: { slot: 3, gen: 1 },
  });
  const collisionEvents = bus.drainPhase(Phase.Collision);
  assert(collisionEvents.length === 0, "Collision should drain nothing (ownership is Impact)");

  // Phase 4: Impact
  bus.enterPhase(Phase.Impact);
  const impactEvents = bus.drainPhase(Phase.Impact);
  assert(impactEvents.length === 1, "Impact should drain PROJECTILE_HIT_ENEMY");

  // Impact emits derived events
  bus.emit(EventType.ENTITY_DAMAGED, {
    target: { slot: 3, gen: 1 },
    amount: 999,
    source: { slot: 2, gen: 1 },
    kind: "bullet",
  });
  bus.emit(EventType.ENTITY_KILLED, {
    target: { slot: 3, gen: 1 },
    reason: "hp<=0",
    killer: { slot: 2, gen: 1 },
    kind: "enemy.drone",
  });

  const impactResults = bus.drainPhase(Phase.Impact);
  assert(impactResults.length === 1, "Impact should drain ENTITY_DAMAGED");

  // Phase 5: Flow
  bus.enterPhase(Phase.Flow);
  const flowEvents = bus.drainPhase(Phase.Flow);
  assert(flowEvents.length === 1, "Flow should drain ENTITY_KILLED in SAME tick");

  bus.emit(EventType.GAME_OVER, { reason: "player_dead" });
  const flowMore = bus.drainPhase(Phase.Flow);
  assert(flowMore.length === 1, "Flow should drain GAME_OVER in same tick");

  // Phase 6: Audio
  bus.enterPhase(Phase.Audio);
  bus.emit(EventType.AUDIO_PLAY, { key: "sfx.explosion.small", vol: 0.8 });
  const audioEvents = bus.drainPhase(Phase.Audio);
  assert(audioEvents.length === 1, "Audio should drain AUDIO_PLAY");

  // Phase 7: Cleanup
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] EventBus v3.1 OK ✅");
}

main();
