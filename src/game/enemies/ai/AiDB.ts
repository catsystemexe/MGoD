// src/game/enemies/ai/AiDB.ts
import type { AiKind, AiStrategy } from "./AiTypes";
import { passiveAi } from "./ais/passive";
import { chasePlayerAi } from "./ais/chasePlayer";

export const AiDB: Record<AiKind, AiStrategy> = {
  passive: passiveAi,
  chasePlayer: chasePlayerAi,
};
