export type Vec2 = { x: number; y: number };

export type PlayerActions = {
  move: Vec2;

  // ✅ add this
  aimTarget: Vec2;

  firePrimary: boolean;
  fireSecondary: boolean;

  bombPressed: boolean;
  bombTarget: Vec2;
};