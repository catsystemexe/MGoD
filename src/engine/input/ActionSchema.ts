export type Vec2 = { x: number; y: number };

export type PlayerActions = {
  move: Vec2;          // normalized

  // Aim point in logic/WU space (cursor target)
  aimTarget: Vec2;

  firePrimary: boolean;   // LMB hold
  fireSecondary: boolean; // RMB hold

  bombPressed: boolean;   // Space buffered trigger
  bombTarget: Vec2;       // captured aimTarget at press time (deterministic)
};
