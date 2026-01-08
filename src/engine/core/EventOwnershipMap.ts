// src/engine/core/EventOwnershipMap.ts
import { Phase, type OwnershipMap } from "./EventBus";
import { EventType, type CMEventMap } from "./events";

export const CM_EVENT_OWNERSHIP: OwnershipMap<CMEventMap> = {
  [EventType.SPAWN_ENEMY]: Phase.Director,
  [EventType.SPAWN_PROJECTILE]: Phase.Simulation,
  [EventType.SPAWN_BOMB]: Phase.Simulation,
  [EventType.SPAWN_PICKUP]: Phase.Director,

  [EventType.PLAYER_FIRE_PRIMARY]: Phase.Simulation,
  [EventType.PLAYER_FIRE_BOMB]: Phase.Simulation,

  [EventType.PROJECTILE_HIT_ENEMY]: Phase.Impact,
  [EventType.PROJECTILE_HIT_CA]: Phase.Impact,

  // ✅ results owned by Flow (consumed by score/state)
  [EventType.CA_CELLS_KILLED]: Phase.Flow,
  [EventType.ENTITY_DAMAGED]: Phase.Flow,
  [EventType.ENTITY_KILLED]: Phase.Flow,
} as const;