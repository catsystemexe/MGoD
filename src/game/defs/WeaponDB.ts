// src/game/defs/WeaponDB.ts
import type { WeaponDB } from "./Weapons";

export const WEAPON_DB: WeaponDB = {
  // W1 animated projectile (your new sprite sheet)
  "w1.basic": {
    id: "w1.basic",
    cooldownSec: 0.12,
    spriteAnimId: "projectile.w1",
    projectile: {
      speed: 700,
      ttlSec: 3,
      damage: 3,
      radius: 2,

      knockback: 0,
      freezeSec: 0,
      spreadRad: 0,
      pellets: 1,
      caInteract: true,
      charge: { enabled: false },
    },
  },

  // Placeholder secondary (you’ll replace later)
  "w2.basic": {
    id: "w2.basic",
    cooldownSec: 0.25,
    projectile: {
      speed: 200,
      ttlSec: 0.8,
      damage: 2,
      radius: 2,
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