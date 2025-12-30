export type Vec2 = { x: number; y: number };

export function v2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// IMPORTANT: return a NEW object, never mutate inputs.
export function lerpV2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
