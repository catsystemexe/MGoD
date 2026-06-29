// src/game/defs/Weapons.ts

export type WeaponSlotId = "w1" | "w2";
export type WeaponFireKind = "projectile" | "beam" | "bomb";
export type WeaponTypeId = string;

export type WeaponAudioSpec = {
  fire?: string | null;
  start?: string | null;
  stop?: string | null;
};

export type WeaponVisualSpec = {
  spriteAnimId?: string;
  sdfShape?: string;
};

export type WeaponProjectileSpec = {
  speed: number;
  ttlSec: number;
  damage: number;
  radius: number;

  // Future extension fields. They are data only in this foundation pass.
  knockback?: number;
  freezeSec?: number;
  spreadRad?: number;
  pellets?: number;
  caInteract?: boolean;
  charge?: { enabled: boolean; minSec?: number; maxSec?: number };
};

export type WeaponBeamSpec = {
  durationSec: number;
  damage: number;
  hitIntervalSec: number;
  visual?: WeaponVisualSpec;
};

export type WeaponBombSpec = {
  travelSec: number;
  ttlSec: number;
  damage: number;
  radius: number;

  // extra bomb-only (optional)
  fuseSec?: number;
  caInteract?: boolean;
  knockback?: number;
  freezeSec?: number;
};

export type WeaponDef = {
  id: WeaponTypeId;
  fireKind: WeaponFireKind;

  // cadence belongs to the weapon (not createGame)
  cooldownSec: number;

  // rendering/audio hooks – optional and semantic only
  spriteAnimId?: string;
  visual?: WeaponVisualSpec;
  audio?: WeaponAudioSpec;

  // one of these according to fireKind
  projectile?: WeaponProjectileSpec;
  beam?: WeaponBeamSpec;
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

export const ACTIVE_W1_WEAPON_ID = "w1.basic" as const;
export const ACTIVE_W2_WEAPON_ID = "w2.laser" as const;

export const WEAPONS_MVP: WeaponsConfig = {
  primary: ACTIVE_W1_WEAPON_ID,
  secondary: ACTIVE_W2_WEAPON_ID,
  bomb: "b1.basic",
  bombCooldownSec: 0.8,
};

export type WeaponInstance = {
  slot: WeaponSlotId;
  weaponId: WeaponTypeId;
  level: number;
  cooldownRemainingSec: number;
  active: boolean;
};

export type EffectiveWeaponSpec = WeaponDef & {
  level: number;
};

export type WeaponSlotSnapshot = {
  slot: WeaponSlotId;
  weaponId: WeaponTypeId;
  level: number;
  fireKind: WeaponFireKind;
  active: boolean;
  cooldownRemainingSec: number;
  cooldownTotalSec: number;
  charge01: number;
  ready01: number;
  damage?: number;
  durationSec?: number;
  hitIntervalSec?: number;
};

export type WeaponRuntimeSnapshot = {
  slots: {
    w1: WeaponSlotSnapshot;
    w2: WeaponSlotSnapshot;
  };
};

export function resolveWeaponDefinition(weaponId: WeaponTypeId, db: WeaponDB): WeaponDef {
  const def = db[weaponId];
  if (!def) throw new Error(`[Weapons] Unknown weaponId: ${String(weaponId)}`);
  return def;
}

export function resolveEffectiveWeaponSpec(instance: WeaponInstance, db: WeaponDB): EffectiveWeaponSpec {
  const def = resolveWeaponDefinition(instance.weaponId, db);
  const fireKind = def.fireKind ?? (def.projectile ? "projectile" : def.beam ? "beam" : "bomb");
  // Foundation pass: level is stored for future modifiers but does not alter stats yet.
  return {
    ...def,
    fireKind,
    projectile: def.projectile ? { ...def.projectile, charge: def.projectile.charge ? { ...def.projectile.charge } : undefined } : undefined,
    beam: def.beam ? { ...def.beam, visual: def.beam.visual ? { ...def.beam.visual } : undefined } : undefined,
    bomb: def.bomb ? { ...def.bomb } : undefined,
    visual: def.visual ? { ...def.visual } : undefined,
    audio: def.audio ? { ...def.audio } : undefined,
    level: instance.level,
  };
}
