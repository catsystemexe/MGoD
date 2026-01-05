// src/engine/core/events.ts
import type { EntityRef } from "../ecs/EntityRef";
import type { Vec2 } from "../math/Vec2";

// ---------- EventType (string literal "enum") ----------
export const EventType = {
  // Phase 1 (Director/Spawns) – requests
  SPAWN_ENEMY: "SPAWN_ENEMY",
  SPAWN_PROJECTILE: "SPAWN_PROJECTILE",
  SPAWN_BOMB: "SPAWN_BOMB",
  SPAWN_PICKUP: "SPAWN_PICKUP",

  // Phase 3 (Collision) – detections
  PROJECTILE_HIT_ENEMY: "PROJECTILE_HIT_ENEMY",

  // Phase 4 (Impact) – results
  ENTITY_DAMAGED: "ENTITY_DAMAGED",
  ENTITY_KILLED: "ENTITY_KILLED",
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

// ---------- Event payload map ----------
export type CMEventMap = {
  // Requests (Director owns)
  [EventType.SPAWN_PROJECTILE]: {
    owner: EntityRef;
    origin: Vec2;
    dir: Vec2;
    weapon: "primary" | "secondary";
  };

  [EventType.SPAWN_BOMB]: {
    owner: EntityRef;
    origin: Vec2;
    target: Vec2;
  };

  // Collision
  [EventType.PROJECTILE_HIT_ENEMY]: {
    projectile: EntityRef;
    enemy: EntityRef;
  };

  // Impact
  [EventType.ENTITY_DAMAGED]: {
    entity: EntityRef;
    amount: number;
    source: string;
  };

  [EventType.ENTITY_KILLED]: {
    entity: EntityRef;
    source: string;
  };
};