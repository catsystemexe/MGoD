// src/game/enemies/ai/ais/chasePlayer.ts
import type { AiStrategy } from "../AiTypes";

const num = (v: any, f: number) => (typeof v === "number" && Number.isFinite(v) ? v : f);

export const chasePlayerAi: AiStrategy = {
  kind: "chasePlayer",
  getVel: (_ent, _ctx, ai, aictx) => {
    const speed = Math.max(0, num((ai as any).speed, 55));
    const leadSec = Math.max(0, num((ai as any).leadSec, 0.15));

    const px = aictx.playerPos.x + aictx.playerVel.x * leadSec;
    const py = aictx.playerPos.y + aictx.playerVel.y * leadSec;

    const ex = num((_ent as any)?.pos?.x, 0);
    const ey = num((_ent as any)?.pos?.y, 0);

    const dx = px - ex;
    const dy = py - ey;

    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;

    return { x: nx * speed, y: ny * speed };
  },
};
