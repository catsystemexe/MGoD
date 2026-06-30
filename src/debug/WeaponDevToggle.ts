import { isTextEditingTarget } from "./CollisionOverlayToggle";

export type W1WeaponToggleTarget = {
  toggleW1Weapon?: () => string;
};

export const W1_WEAPON_TOGGLE_KEY = "KeyJ";

export function handleW1WeaponToggleKeydown(
  event: Pick<KeyboardEvent, "code" | "repeat" | "target" | "preventDefault">,
  target: W1WeaponToggleTarget,
): string | null {
  if (event.code !== W1_WEAPON_TOGGLE_KEY) return null;
  if (event.repeat) return null;
  if (isTextEditingTarget(event.target)) return null;
  const next = target.toggleW1Weapon?.();
  if (!next) return null;
  event.preventDefault?.();
  return next;
}
