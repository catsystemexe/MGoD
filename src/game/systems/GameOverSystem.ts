/**
 * GameOverSystem (CM v3.1)
 * Phase 5 (Flow): listens to Flow events and sets session.gameOver.
 *
 * MVP policy:
 * - If PLAYER entity is killed -> game over.
 *
 * This assumes ENTITY_KILLED payload contains { target } and you can recognize player by ref or by tagging.
 * For MVP smoke we keep it simple: if payload has { isPlayer: true }.
 */

import { EventType } from "../../engine/core/events";
import type { FlowListener } from "./FlowDispatcher";
import type { SessionState } from "../data/SessionState";

export class GameOverSystem implements FlowListener {
  constructor(private readonly session: SessionState) {}

  onFlowEvents(events: Array<{ type: string; payload: unknown; tick: number }>): void {
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
