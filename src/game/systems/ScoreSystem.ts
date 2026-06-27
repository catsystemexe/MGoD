// src/game/systems/ScoreSystem.ts
import { EventType, type CMEventMap } from "../../engine/core/events";

export interface SessionState {
  score: number;
}

export type ScoreConfig = {
  pointsPerEnemyKill: number;
  pointsPerCellKilled: number;
};

// legacy/game-smoke config (Flow.smoke.ts)
export type ScoreConfigSmoke = {
  pointsPerCell: number;
  pointsPerEntityKill: number;
};

type AnyCMEvent = { type: keyof CMEventMap; payload: CMEventMap[keyof CMEventMap] };

function normalizeCfg(cfg: ScoreConfig | ScoreConfigSmoke): ScoreConfig {
  const c: any = cfg;

  if ("pointsPerCell" in c || "pointsPerEntityKill" in c) {
    return {
      pointsPerEnemyKill: Number(c.pointsPerEntityKill ?? 0),
      pointsPerCellKilled: Number(c.pointsPerCell ?? 0),
    };
  }

  return {
    pointsPerEnemyKill: Number(c.pointsPerEnemyKill ?? 0),
    pointsPerCellKilled: Number(c.pointsPerCellKilled ?? 0),
  };
}

export class ScoreSystem {
  private readonly session: SessionState;
  private readonly cfg: ScoreConfig;

  constructor(session: SessionState, cfg: ScoreConfig | ScoreConfigSmoke) {
    this.session = session;
    this.cfg = normalizeCfg(cfg);
  }

  /** FlowDispatcher listener API */
  onFlowEvents(events: AnyCMEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case EventType.ENTITY_KILLED: {
          const p = e.payload as any;
          if (p?.isPlayer === true) break; // nepočítat smrt hráče
          this.session.score += this.cfg.pointsPerEnemyKill;
          break;
        }

        case EventType.CA_CELLS_KILLED: {
          const p = e.payload as CMEventMap[typeof EventType.CA_CELLS_KILLED];
          this.session.score += (p.count | 0) * this.cfg.pointsPerCellKilled;
          break;
        }

        default:
          break;
      }
    }
  }
}