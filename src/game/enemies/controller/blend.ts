// src/game/enemies/controller/blend.ts
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function smoothTo(current: number, target: number, easeSec: number, dt: number): number {
  const c = clamp01(current);
  const t = clamp01(target);

  if (!(easeSec > 0) || !Number.isFinite(easeSec)) return t;

  // exp smoothing stable under dt jitter
  const k = 1 / Math.max(0.0001, easeSec);
  const a = 1 - Math.exp(-k * dt);
  return c + (t - c) * a;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
