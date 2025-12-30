export const Config = {
  // =========
  // ENGINE
  // =========
  FIXED_HZ: 60,
  CA_HZ: 15,

  // =========
  // WORLD
  // =========
  WORLD_W: 220,
  WORLD_H: 140,

  // =========
  // PLAYER
  // =========
  PLAYER_SPEED: 55,

  // =========
  // DEBUG
  // =========
  SHOW_OVERLAY: true,

  // =========
  // PHASE 2 FLAG
  // =========
  ENABLE_PHASE2: true, // <- přepínej dle potřeby

  // =========
  // PHASE 2: CA stability chunks
  // =========
  CHUNK_SIZE: 16,
  STABLE_TICKS_REQUIRED: 18, // kolik CA ticků musí být hash stejný

  // =========
  // PHASE 2: injector
  // =========
  INJECT_EVERY_CA_TICKS: 20,

  // =========
  // PHASE 2: pickups
  // =========
  PICKUP_MAX_ACTIVE: 6,

  // =========
  // PHASE 2: snake
  // =========
  SNAKE_INITIAL_LEN: 3,         // segmenty
  SNAKE_SPACING_TICKS: 2,       // kolik fixed ticků mezi segmenty v historii
  SNAKE_SELF_HIT_GRACE: 6,       // kolik segmentů od hlavy ignorovat
  SNAKE_SPEED_NORM: 1.2,
  
  // Phase2 snake tuning
  SNAKE_SEG_MIN_DIST: 8,   // min vzdálenost hlavy pro přidání segmentu
  SNAKE_SEGS_PER_LEN: 1,    // hustota ocasu
  SNAKE_SELF_SKIP: 20,       // ignoruj posledních N segmentů při self-hit
  PICKUP_SPAWN_TRIES: 60,    // kolikrát zkusit najít živou buňku ve stable chunku
  SNAKE_FOLLOW_STIFFNESS: 0.1,
  SNAKE_DAMPING: 0.95,
  SNAKE_CONSTRAINT_ITERS: 9,
  SNAKE_STRETCH_MIN: 0.85,
  SNAKE_STRETCH_MAX: 1.25,
  } as const;