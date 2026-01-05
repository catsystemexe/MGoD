export type WeaponId = "primary" | "secondary";

export type WeaponConfig = {
  cooldownSec: number; // hold fire cadence
};

export type WeaponsConfig = {
  primary: WeaponConfig;
  secondary: WeaponConfig;
  bombCooldownSec: number; // optional lockout
};
