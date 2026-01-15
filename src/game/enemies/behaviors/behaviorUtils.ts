export function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : fallback;
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
