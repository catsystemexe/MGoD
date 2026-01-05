import type { Vec2 } from "../../engine/input/ActionSchema";

export type PlayerData = {
  pos: Vec2;     // WU
  vel: Vec2;     // WU/s
  aimDir: Vec2;  // unit vector, sticky
  speed: number; // WU/s
};
