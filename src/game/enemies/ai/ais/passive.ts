// src/game/enemies/ai/ais/passive.ts
import type { AiStrategy } from "../AiTypes";

export const passiveAi: AiStrategy = {
  kind: "passive",
  getVel: () => ({ x: 0, y: 0 }),
};
