import { EventType } from "../../engine/core/events";
import type { FlowListener } from "./FlowDispatcher";
import type { SessionState } from "../data/SessionState";

export type ScoreRules = {
  pointsPerCell: number;       // default 1
  pointsPerEntityKill: number; // default 0 (MVP)
};

export class ScoreSystem implements FlowListener {
  constructor(
    private readonly session: SessionState,
    private readonly rules: ScoreRules,
  ) {}

  onFlowEvents(events: Array<{ type: string; payload: unknown; tick: number }>): void {
    for (const e of events) {
      if (e.type === EventType.CA_CELLS_KILLED) {
        const { count } = e.payload as { count: number };
        this.session.score += count * this.rules.pointsPerCell;
        continue;
      }
      if (e.type === EventType.ENTITY_KILLED) {
        this.session.score += this.rules.pointsPerEntityKill;
        continue;
      }
    }
  }
}
