export type Vec2 = { x: number; y: number };

export function v2(x = 0, y = 0): Vec2 { return { x, y }; }
export function copyV2(a: Vec2): Vec2 { return { x: a.x, y: a.y }; }
export function setV2(out: Vec2, x: number, y: number): Vec2 { out.x = x; out.y = y; return out; }
