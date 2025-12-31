import { Vec2 } from "../utils/math";

export type PlayerState = { prev: Vec2; cur: Vec2 };
export type SnakeSeg = { x: number; y: number };

export type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
  dmg: number;
  kind: "w1" | "w2";
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

export type EnemyType = "skiff" | "miner";

export type Enemy = {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  // Cooldown na "akci" (položení glideru/miny)
  actionTimer: number;
  actionInterval: number;
  color: string;
};
