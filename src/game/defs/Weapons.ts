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
  sdfColor?: string;
  sdfTipColor?: string;
  sdfSize?: number;
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

export type WeaponLevelSpec = {
  projectileCount?: number;
  durationSec?: number;
};

export type WeaponDef = {
  id: WeaponTypeId;
  name?: string;
  slot?: WeaponSlotId;
  fireKind: WeaponFireKind;

  // cadence belongs to the weapon (not createGame)
  cooldownSec: number;

  // rendering/audio hooks – optional and semantic only
  spriteAnimId?: string;
  visual?: WeaponVisualSpec;
  audio?: WeaponAudioSpec;

  levels?: ReadonlyArray<WeaponLevelSpec>;

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
  maxLevel: number;
  projectileCount?: number;
};

export type WeaponSlotSnapshot = {
  slot: WeaponSlotId;
  weaponId: WeaponTypeId;
  level: number;
  maxLevel: number;
  fireKind: WeaponFireKind;
  active: boolean;
  cooldownRemainingSec: number;
  cooldownTotalSec: number;
  charge01: number;
  ready01: number;
  damage?: number;
  projectileCount?: number;
  displayName?: string;
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

export function getWeaponMaxLevel(weaponId: WeaponTypeId, db: WeaponDB): number {
  const levels = resolveWeaponDefinition(weaponId, db).levels;
  return Math.max(1, levels?.length ?? 1);
}

export function normalizeWeaponLevel(level: number, maxLevel: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(Math.max(1, Math.floor(maxLevel)), Math.floor(level)));
}

export function resolveEffectiveWeaponSpec(instance: WeaponInstance, db: WeaponDB): EffectiveWeaponSpec {
  const def = resolveWeaponDefinition(instance.weaponId, db);
  const fireKind = def.fireKind ?? (def.projectile ? "projectile" : def.beam ? "beam" : "bomb");
  const levels = def.levels ? def.levels.map((level) => ({ ...level })) : undefined;
  const maxLevel = Math.max(1, levels?.length ?? 1);
  const level = normalizeWeaponLevel(instance.level, maxLevel);
  const levelSpec = levels?.[level - 1];
  const beam = def.beam ? {
    ...def.beam,
    durationSec: Number(levelSpec?.durationSec ?? def.beam.durationSec),
    visual: def.beam.visual ? { ...def.beam.visual } : undefined,
  } : undefined;

  return {
    ...def,
    fireKind,
    levels,
    projectile: def.projectile ? { ...def.projectile, charge: def.projectile.charge ? { ...def.projectile.charge } : undefined } : undefined,
    beam,
    bomb: def.bomb ? { ...def.bomb } : undefined,
    visual: def.visual ? { ...def.visual } : undefined,
    audio: def.audio ? { ...def.audio } : undefined,
    level,
    maxLevel,
    projectileCount: Math.max(1, Math.floor(Number(levelSpec?.projectileCount ?? def.projectile?.pellets ?? 1))),
  };
}
