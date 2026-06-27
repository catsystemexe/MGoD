// src/game/enemies/ai/AiTypes.ts
import type { TickContext } from "../../../engine/core/Loop";

export type Vec2 = { x: number; y: number };

export type AiKind = "passive" | "chasePlayer";

export type AiParams =
  | { kind: "passive" }
  | { kind: "chasePlayer"; speed?: number; leadSec?: number };

export type AiCtx = {
  playerPos: Vec2;
  playerVel: Vec2;
};

export type AiStrategy = {
  kind: AiKind;
  getVel: (ent: any, ctx: TickContext, ai: AiParams, aictx: AiCtx) => Vec2;
};
