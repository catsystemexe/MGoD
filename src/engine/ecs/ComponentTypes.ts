export type EntityFlags = number;

export const enum EntityFlag {
  Consumed = 1 << 0,
  Invulnerable = 1 << 1,
}

export interface BaseEntity {
  id: number;          // debug only
  gen: number;
  alive: boolean;
  pendingKill: boolean;
  flags: EntityFlags;
}
