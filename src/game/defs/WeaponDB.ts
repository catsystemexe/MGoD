// src/game/defs/WeaponDB.ts
import type { WeaponDB } from "./Weapons";

export const WEAPON_DB: WeaponDB = {
  // W1 animated projectile (your new sprite sheet)
  "w1.basic": {
    id: "w1.basic",
    cooldownSec: 0.12,
    spriteAnimId: "projectile.w1",
    projectile: {
      speed: 1100,
      ttlSec: 3,
      damage: 3,
      radius: 5,

      knockback: 0,
      freezeSec: 0,
      spreadRad: 0,
      pellets: 1,
      caInteract: true,
      charge: { enabled: false },
    },
  },

  // W2: heavy secondary — single large orb, high damage, slow cadence.
  "w2.basic": {
    id: "w2.basic",
    cooldownSec: 0.7,
    projectile: {
      speed: 260,
      ttlSec: 2.0,
      damage: 8,
      radius: 6,
      pellets: 1,
      spreadRad: 0,
      caInteract: false,
      charge: { enabled: false },
    },
  },

  // Placeholder bomb
  "b1.basic": {
    id: "b1.basic",
    cooldownSec: 0.8, // you can ignore later if you want per-slot logic
    bomb: {
      travelSec: 0.4,
      ttlSec: 0.4,
      damage: 10,
      radius: 10,
      caInteract: true,
    },
  },
} as const;