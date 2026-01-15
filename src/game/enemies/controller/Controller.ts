// src/game/enemies/controller/Controller.ts
import { clamp01, lerp } from "./blend";

export type Vec2 = { x: number; y: number };

export function resolveVel(railVel: Vec2, aiVel: Vec2, aiWeight: number): Vec2 {
  const w = clamp01(aiWeight);
  return {
    x: lerp(railVel.x, aiVel.x, w),
    y: lerp(railVel.y, aiVel.y, w),
  };
}
