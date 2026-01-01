import type { UpgradeType } from "../game/types";

export type GameEvents = {
  "weapon.primary.fired": {};
  "weapon.secondary.fired": {};
  "upgrade.picked": { type: UpgradeType };
  "debug.tick": { dt: number };

  "upgrade.applied": { type: UpgradeType };
  "bomb.gain": {};
  "bomb.throw": {};

  "weapon.primary.trigger": { down: boolean };
  "weapon.secondary.trigger": {};

  "player.damage": { dmg: number; energyAfter: number };
};