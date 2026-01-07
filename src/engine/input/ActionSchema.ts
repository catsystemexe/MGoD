// src/engine/input/ActionSchema.ts
export type Vec2 = { x: number; y: number };

export type PlayerActions = {
  move: Vec2;

  // Aim point in LOGIC coords (same as bomb target space)
  aim: Vec2;

  firePrimary: boolean;
  fireSecondary: boolean;

  // Bomb is a one-tick pulse (buffered)
  bombPressed: boolean;
  bombTarget: Vec2;
};