/**
 * Captain Meow (CM) – Event Ownership Map
 * v3.1 contract:
 *  - Each EventType has EXACTLY ONE owner phase.
 *  - drainPhase(phase) drains only events owned by that phase.
 *  - Same-tick routing emerges naturally: events stay in qNow until their owner drains them.
 */

import { Phase, type OwnershipMap } from "./EventBus";
import { EventType, type CMEventMap } from "./events";

/**
 * Ownership rationale (v3.1):
 * - SPAWN_* are "requests" (often emitted from Simulation), executed by SpawnSystem in Phase.Director.
 *   => ownership = Director (so SpawnSystem drains them).
 * - *_HIT_* are detections from Collision, but processed in Impact.
 *   => ownership = Impact.
 * - Impact "produces" results (e.g., CA_CELLS_KILLED, ENTITY_DAMAGED), but Flow "consumes" them.
 *   => ownership = Flow (so Flow drains them).
 * - Flow owns meta outcomes like ENTITY_KILLED/GAME_OVER (score/state transitions).
 * - Audio owns AUDIO_PLAY (optional; can also derive directly from Flow/Impact events).
 */
export const CM_EVENT_OWNERSHIP: OwnershipMap<CMEventMap> = {
  // ---- Phase 1: Director/Spawn (requests executed by SpawnSystem) ----
  [EventType.SPAWN_ENEMY]: Phase.Director,
  [EventType.SPAWN_PROJECTILE]: Phase.Director,
  [EventType.SPAWN_BOMB]: Phase.Director,
  [EventType.SPAWN_PICKUP]: Phase.Director,

  // ---- Phase 2: Simulation (optional telemetry/action events) ----
  [EventType.PLAYER_FIRE_PRIMARY]: Phase.Simulation,
  [EventType.PLAYER_FIRE_BOMB]: Phase.Simulation,

  // ---- Phase 4: Impact consumes collision detections ----
  [EventType.PROJECTILE_HIT_ENEMY]: Phase.Impact,
  [EventType.PROJECTILE_HIT_CA]: Phase.Impact,
  [EventType.PLAYER_HIT_ENEMY]: Phase.Impact,
  [EventType.PLAYER_HIT_CA]: Phase.Impact,

  // ---- Phase 5: Flow consumes Impact results & owns meta ----
  [EventType.CA_CELLS_KILLED]: Phase.Flow,
  [EventType.ENTITY_DAMAGED]: Phase.Flow,
  [EventType.ENTITY_KILLED]: Phase.Flow,
  [EventType.GAME_OVER]: Phase.Flow,
  [EventType.LEVEL_COMPLETED]: Phase.Flow,

  // ---- Phase 6: Audio ----
  [EventType.AUDIO_PLAY]: Phase.Audio,
};