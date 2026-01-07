// src/engine/core/events.ts
import type { EntityRef } from "../ecs/EntityRef";
import type { Vec2 } from "../math/Vec2";

export const EventType = {
  SPAWN_ENEMY: "SPAWN_ENEMY",
  SPAWN_PROJECTILE: "SPAWN_PROJECTILE",
  SPAWN_BOMB: "SPAWN_BOMB",
  SPAWN_PICKUP: "SPAWN_PICKUP",

  PLAYER_FIRE_PRIMARY: "PLAYER_FIRE_PRIMARY",
  PLAYER_FIRE_BOMB: "PLAYER_FIRE_BOMB",

  PROJECTILE_HIT_ENEMY: "PROJECTILE_HIT_ENEMY",
  PROJECTILE_HIT_CA: "PROJECTILE_HIT_CA",

  CA_CELLS_KILLED: "CA_CELLS_KILLED",
  ENTITY_DAMAGED: "ENTITY_DAMAGED",
  ENTITY_KILLED: "ENTITY_KILLED",
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export type CMEventMap = {
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

  [EventType.SPAWN_ENEMY]: { typeId: string };
  [EventType.SPAWN_PICKUP]: { defId: string; pos: Vec2 };

  [EventType.PLAYER_FIRE_PRIMARY]: { owner: EntityRef };
  [EventType.PLAYER_FIRE_BOMB]: { owner: EntityRef; target: Vec2 };

  [EventType.PROJECTILE_HIT_ENEMY]: { projectile: EntityRef; enemy: EntityRef };
  [EventType.PROJECTILE_HIT_CA]: { projectile: EntityRef; x: number; y: number };

  [EventType.CA_CELLS_KILLED]: { count: number; source: string };

  // ✅ sjednoceno dle Flow.smoke.ts
  [EventType.ENTITY_DAMAGED]: {
    target: EntityRef;
    amount: number;
    hpAfter: number;
  };

  // ✅ sjednoceno dle Flow.smoke.ts
  [EventType.ENTITY_KILLED]: {
    target: EntityRef;
    source: string;
    isPlayer: boolean;
  };
};