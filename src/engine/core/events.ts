/**
 * Captain Meow (CM) – Core Events
 * v3.1 contract:
 *  - EventTypes are string literals
 *  - EventMap defines payload shapes
 *  - Ownership is defined separately (EventOwnershipMap.ts)
 *
 * Notes:
 *  - Keep payloads minimal & serializable (for replay/debug).
 *  - Use EntityRef for stable identity (slot+gen).
 */

export type EntityRef = {
  slot: number;
  gen: number;
};

// ---------- EventType (string literal union) ----------

export const EventType = {
  // Phase 1 (Director/Spawns) – requests
  SPAWN_ENEMY: "SPAWN_ENEMY",
  SPAWN_PROJECTILE: "SPAWN_PROJECTILE",
  SPAWN_PICKUP: "SPAWN_PICKUP",

  // Phase 2 (Simulation) – player actions (optional, useful for audio/telemetry)
  PLAYER_FIRE_PRIMARY: "PLAYER_FIRE_PRIMARY",
  PLAYER_FIRE_BOMB: "PLAYER_FIRE_BOMB",

  // Phase 3 (Collision) – detection only
  PROJECTILE_HIT_ENEMY: "PROJECTILE_HIT_ENEMY",
  PROJECTILE_HIT_CA: "PROJECTILE_HIT_CA",
  PLAYER_HIT_ENEMY: "PLAYER_HIT_ENEMY",
  PLAYER_HIT_CA: "PLAYER_HIT_CA",

  // Phase 4 (Impact) – batched results + damage
  CA_CELLS_KILLED: "CA_CELLS_KILLED",
  ENTITY_DAMAGED: "ENTITY_DAMAGED",

  // Phase 5 (Flow) – lifecycle/meta
  ENTITY_KILLED: "ENTITY_KILLED",
  GAME_OVER: "GAME_OVER",
  LEVEL_COMPLETED: "LEVEL_COMPLETED",

  // Phase 6 (Audio) – optional explicit audio events (usually derived from above)
  AUDIO_PLAY: "AUDIO_PLAY",
} as const;

export type CMEventType = typeof EventType[keyof typeof EventType];

// ---------- Payload types ----------

export type SpawnEnemyPayload = {
  defId: string; // e.g. "enemy.drone"
  x: number;
  y: number;
  vx?: number;
  vy?: number;
};

export type SpawnProjectilePayload = {
  owner: EntityRef; // who fired
  defId: string;    // e.g. "proj.laser"
  x: number;
  y: number;
  dirX: number;
  dirY: number;
};

export type SpawnPickupPayload = {
  defId: string; // e.g. "pickup.energy"
  x: number;
  y: number;
};

export type PlayerFirePayload = {
  player: EntityRef;
};

export type ProjectileHitEnemyPayload = {
  projectile: EntityRef;
  enemy: EntityRef;
  // Optional contact info (kept minimal for determinism; avoid floats if not needed)
};

export type ProjectileHitCAPayload = {
  projectile: EntityRef;
  // Impact position in World Units (1 WU = 1 logic px)
  x: number;
  y: number;
  // Optional "strength" scalar for operator selection
  strength?: number;
};

export type PlayerHitEnemyPayload = {
  player: EntityRef;
  enemy: EntityRef;
};

export type PlayerHitCAPayload = {
  player: EntityRef;
  x: number;
  y: number;
};

export type CACellsKilledPayload = {
  count: number;     // batched
  source: string;    // e.g. "explosion", "bullet"
  // Optional bounds for debugging / effects:
  // minX?: number; minY?: number; maxX?: number; maxY?: number;
};

export type EntityDamagedPayload = {
  target: EntityRef;
  amount: number;
  source?: EntityRef; // projectile or enemy; optional
  kind?: string;      // e.g. "bullet", "collision", "ca"
};

export type EntityKilledPayload = {
  target: EntityRef;
  reason: string;     // "hp<=0" | "ttl" | "oob" | ...
  killer?: EntityRef; // optional
  kind?: string;      // type tag for audio mapping, optional (e.g. "enemy.drone")
};

export type GameOverPayload = {
  reason: string;     // "player_dead" | "timeout" | ...
};

export type LevelCompletedPayload = {
  reason?: string;    // e.g. "boss_dead"
};

export type AudioPlayPayload = {
  key: string;        // "sfx.explosion.small"
  vol?: number;       // 0..1
  pitch?: number;     // optional
};

// ---------- EventMap (EventType -> payload) ----------

export type CMEventMap = {
  // Phase 1
  [EventType.SPAWN_ENEMY]: SpawnEnemyPayload;
  [EventType.SPAWN_PROJECTILE]: SpawnProjectilePayload;
  [EventType.SPAWN_PICKUP]: SpawnPickupPayload;

  // Phase 2
  [EventType.PLAYER_FIRE_PRIMARY]: PlayerFirePayload;
  [EventType.PLAYER_FIRE_BOMB]: PlayerFirePayload;

  // Phase 3
  [EventType.PROJECTILE_HIT_ENEMY]: ProjectileHitEnemyPayload;
  [EventType.PROJECTILE_HIT_CA]: ProjectileHitCAPayload;
  [EventType.PLAYER_HIT_ENEMY]: PlayerHitEnemyPayload;
  [EventType.PLAYER_HIT_CA]: PlayerHitCAPayload;

  // Phase 4
  [EventType.CA_CELLS_KILLED]: CACellsKilledPayload;
  [EventType.ENTITY_DAMAGED]: EntityDamagedPayload;

  // Phase 5
  [EventType.ENTITY_KILLED]: EntityKilledPayload;
  [EventType.GAME_OVER]: GameOverPayload;
  [EventType.LEVEL_COMPLETED]: LevelCompletedPayload;

  // Phase 6 (optional explicit)
  [EventType.AUDIO_PLAY]: AudioPlayPayload;
};

// Small helper for building Set<CMEventType> safely if you need it later.
export const CM_EVENT_TYPES: CMEventType[] = Object.values(EventType);
