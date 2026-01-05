/**
 * Captain Meow (CM) – Event Ownership Map
 * v3.1 contract:
 *  - Each EventType has EXACTLY ONE owner phase.
 *  - drainPhase(phase) drains only events owned by that phase.
 *  - Same-tick routing emerges naturally: events stay in qNow until their owner drains them.
 */

import { Phase } from "./EventBus";
import { EventType, type CMEventMap } from "./events";
import type { OwnershipMap } from "./EventBus";

/**
 * Ownership rationale (v3.1):
 * - SPAWN_* are "requests" created by Director/Player etc, but ONLY SpawnSystem (Phase 1) owns execution.
 * - *_HIT_* are detection results from Collision (Phase 3) but are consumed/processed by Impact (Phase 4).
 * - Impact emits CA_CELLS_KILLED + ENTITY_DAMAGED (owned by Impact itself).
 * - Flow owns meta outcomes like ENTITY_KILLED/GAME_OVER (score/game state transitions).
 * - Audio owns AUDIO_PLAY (or it can derive from Flow/Impact events directly and not need AUDIO_PLAY).
 */
export const CM_EVENT_OWNERSHIP: OwnershipMap<CMEventMap> = {
  // ---- Phase 1: Director/Spawn ----
  [EventType.SPAWN_ENEMY]: Phase.Director,
  [EventType.SPAWN_PROJECTILE]: Phase.Director,
  [EventType.SPAWN_PICKUP]: Phase.Director,

  // ---- Phase 2: Simulation (optional telemetry/action events) ----
  // We keep these owned by Simulation so a later phase could still see them by remapping,
  // but in MVP they can be ignored or used by Audio via explicit AUDIO_PLAY events.
  [EventType.PLAYER_FIRE_PRIMARY]: Phase.Simulation,
  [EventType.PLAYER_FIRE_BOMB]: Phase.Simulation,

  // ---- Phase 4: Impact consumes collision detections ----
  [EventType.PROJECTILE_HIT_ENEMY]: Phase.Impact,
  [EventType.PROJECTILE_HIT_CA]: Phase.Impact,
  [EventType.PLAYER_HIT_ENEMY]: Phase.Impact,
  [EventType.PLAYER_HIT_CA]: Phase.Impact,

  // ---- Phase 4: Impact results ----
  [EventType.CA_CELLS_KILLED]: Phase.Flow,
  [EventType.ENTITY_DAMAGED]: Phase.Flow,

  // ---- Phase 5: Flow/meta outcomes ----
  [EventType.ENTITY_KILLED]: Phase.Flow,
  [EventType.GAME_OVER]: Phase.Flow,
  [EventType.LEVEL_COMPLETED]: Phase.Flow,

  // ---- Phase 6: Audio (explicit audio requests) ----
  [EventType.AUDIO_PLAY]: Phase.Audio,
};
