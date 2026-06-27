import type { Vec2 } from "../../engine/math/Vec2";

export type PlayerData = {
  kind: "player";
  pos: Vec2;
  vel: Vec2;
 
  speed: number;    // WU/sec
  radius: number;
  alive: boolean;
  pendingKill: boolean;
  gen: number;
  id: number;
  flags: number;
  invulnT?: number;
  deadT?: number;
  hitFlashT?: number;
};
