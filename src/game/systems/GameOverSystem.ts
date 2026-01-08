// src/game/systems/GameOverSystem.ts
import { EventType, type CMEventMap } from "../../engine/core/events";

type AnyCMEvent = { type: keyof CMEventMap; payload: CMEventMap[keyof CMEventMap] };

export class GameOverSystem {
  constructor(private readonly session: { gameOver: boolean }) {}

  onFlowEvents(events: AnyCMEvent[]): void {
    if (this.session.gameOver) return;

    for (const e of events) {
      if (e.type !== EventType.ENTITY_KILLED) continue;
      const p = e.payload as any;
      if (p?.isPlayer === true) {
        this.session.gameOver = true;
        return;
      }
    }
  }
}