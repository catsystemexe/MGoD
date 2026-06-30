// src/game/defs/WeaponDB.ts
import type { WeaponDB } from "./Weapons";

export const WEAPON_DB: WeaponDB = {
  // W1 animated projectile (current primary weapon)
  "w1.basic": {
    id: "w1.basic",
    name: "Bolt",
    slot: "w1",
    fireKind: "projectile",
    cooldownSec: 0.12,
    spriteAnimId: "projectile.w1",
    visual: { spriteAnimId: "projectile.w1" },
    audio: { fire: "player.primary.fire" },
    levels: [
      { projectileCount: 1 },
      { projectileCount: 2 },
      { projectileCount: 3 },
      { projectileCount: 4 },
      { projectileCount: 5 },
    ],
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

  // W1 spread weapon: short yellow/orange fan bolts.
  "w1.spread": {
    id: "w1.spread",
    name: "Spread Gun",
    slot: "w1",
    fireKind: "projectile",
    cooldownSec: 0.32,
    spriteAnimId: "projectile.w1",
    visual: {
      spriteAnimId: "projectile.w1",
      sdfShape: "bolt",
      sdfColor: "#ffd21f",
      sdfTipColor: "#ff8a00",
      sdfSize: 1.7,
    },
    audio: { fire: "player.primary.fire" },
    levels: [
      { projectileCount: 2 },
      { projectileCount: 3 },
      { projectileCount: 4 },
      { projectileCount: 5 },
      { projectileCount: 5 },
    ],
    projectile: {
      speed: 980,
      ttlSec: 1.15,
      damage: 2,
      radius: 5,

      knockback: 0,
      freezeSec: 0,
      spreadRad: 0,
      pellets: 1,
      caInteract: true,
      charge: { enabled: false },
    },
  },

  // W2 active secondary weapon: the current hold-to-fire SDF laser.
  "w2.laser": {
    id: "w2.laser",
    name: "Laser",
    slot: "w2",
    fireKind: "beam",
    cooldownSec: 10.0,
    visual: { sdfShape: "laser" },
    audio: { start: null, stop: null },
    levels: [
      { durationSec: 1.0 },
      { durationSec: 2.0 },
      { durationSec: 3.0 },
      { durationSec: 4.0 },
      { durationSec: 5.0 },
    ],
    beam: {
      durationSec: 1.0,
      damage: 15,
      hitIntervalSec: 0.08,
      visual: { sdfShape: "laser" },
    },
  },

  // Placeholder bomb. The active bomb path still uses createGame spawn tuning.
  "b1.basic": {
    id: "b1.basic",
    fireKind: "bomb",
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
