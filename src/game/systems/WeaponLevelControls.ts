import type { PlayerActions } from "../../engine/input/ActionSchema";
import type { WeaponSlotId } from "../defs/Weapons";
import type { WeaponSystem } from "./WeaponSystem";

export function nextWeaponLevel(currentLevel: number, maxLevel: number): number {
  const max = Math.max(1, Math.floor(Number(maxLevel) || 1));
  const current = Math.max(1, Math.min(max, Math.floor(Number(currentLevel) || 1)));
  return current >= max ? 1 : current + 1;
}

export function cycleWeaponLevel(weaponSystem: Pick<WeaponSystem, "getLevel" | "getMaxLevel" | "setLevel">, slot: WeaponSlotId): void {
  weaponSystem.setLevel(slot, nextWeaponLevel(weaponSystem.getLevel(slot), weaponSystem.getMaxLevel(slot)));
}

export function applyWeaponLevelControlActions(
  weaponSystem: Pick<WeaponSystem, "getLevel" | "getMaxLevel" | "setLevel">,
  actions: Pick<PlayerActions, "cycleW1LevelPressed" | "cycleW2LevelPressed">,
): void {
  if (actions.cycleW1LevelPressed) cycleWeaponLevel(weaponSystem, "w1");
  if (actions.cycleW2LevelPressed) cycleWeaponLevel(weaponSystem, "w2");
}
