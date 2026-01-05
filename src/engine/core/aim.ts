export type Vec2 = { x: number; y: number };

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function len(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function normalize(v: Vec2): Vec2 {
  const l = len(v);
  if (l <= 1e-6) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

/**
 * Compute aim direction from ship position and aim target.
 * If target is too close, returns lastDir (sticky) to avoid NaN and aim jitter.
 */
export function computeAimDir(shipPos: Vec2, aimTarget: Vec2, lastDir: Vec2): Vec2 {
  const d = sub(aimTarget, shipPos);
  const l = len(d);
  if (l <= 1e-3) return lastDir;
  const nd = { x: d.x / l, y: d.y / l };
  return nd;
}
