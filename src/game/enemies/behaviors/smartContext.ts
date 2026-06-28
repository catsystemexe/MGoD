export type SmartBehaviorContext = {
  dt?: number;
  playerPos?: { x: number; y: number } | null;
  logicH?: number;
};

export function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}

export function positive(v: unknown, fallback: number, min: number): number {
  return Math.max(min, num(v, fallback));
}

export function playerTargetY(ctx: SmartBehaviorContext, offsetY: number): number | null {
  const y = ctx?.playerPos?.y;
  if (typeof y !== "number" || !Number.isFinite(y)) return null;
  return y + offsetY;
}

export function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}
