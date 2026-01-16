// src/game/defs/Weapons.ts

export type WeaponSlotId = "primary" | "secondary";
export type WeaponTypeId = string;

export type WeaponProjectileSpec = {
  speed: number;
  ttlSec: number;
  damage: number;
  radius: number;

  // extra gameplay flags (MVP-ready)
  knockback?: number;     // impulse strength
  freezeSec?: number;     // 0/undefined => off
  spreadRad?: number;     // +/- radians
  pellets?: number;       // for spread guns (default 1)
  caInteract?: boolean;   // interacts with CA (hit/ignite/etc.)
  charge?: { enabled: boolean; minSec?: number; maxSec?: number }; // optional
};

export type WeaponBombSpec = {
  travelSec: number;
  ttlSec: number;
  damage: number;
  radius: number;

  // extra bomb-only (optional)
  fuseSec?: number;       // delay before explode (if you want)
  caInteract?: boolean;
  knockback?: number;
  freezeSec?: number;
};

export type WeaponDef = {
  id: WeaponTypeId;

  // cadence belongs to the weapon (not createGame)
  cooldownSec: number;

  // rendering hook (atlas anim id) – optional
  spriteAnimId?: string;

  // one of these
  projectile?: WeaponProjectileSpec;
  bomb?: WeaponBombSpec;
};

export type WeaponDB = Record<WeaponTypeId, WeaponDef>;

// player loadout = which concrete weapon types are equipped in slots
export type WeaponsConfig = {
  primary: WeaponTypeId;
  secondary: WeaponTypeId;
  bomb: WeaponTypeId;

  // optional global lockout if you still want it (keep for later)
  bombCooldownSec?: number;
};
export const WEAPONS_MVP: WeaponsConfig = {
  primary: "w1.basic",
  secondary: "w2.basic",
  bomb: "b1.basic",
  bombCooldownSec: 0.8,
};