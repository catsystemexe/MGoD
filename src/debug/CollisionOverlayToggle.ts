export type CollisionOverlayTarget = {
  getDebugCollisionOverlay?: () => boolean;
  setDebugCollisionOverlay?: (enabled: boolean) => void;
};

export function isTextEditingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = String(el.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.isContentEditable || !!el.closest?.("[contenteditable=''],[contenteditable='true']");
}

export function handleCollisionOverlayKeydown(event: Pick<KeyboardEvent, "code" | "repeat" | "target" | "preventDefault">, target: CollisionOverlayTarget): boolean {
  if (event.code !== "KeyH") return false;
  if (event.repeat) return false;
  if (isTextEditingTarget(event.target)) return false;
  const next = !target.getDebugCollisionOverlay?.();
  target.setDebugCollisionOverlay?.(next);
  event.preventDefault?.();
  return true;
}
