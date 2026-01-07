import { Phase, type EventBus } from "../../engine/core/EventBus";
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

function isBus(x: unknown): x is EventBus<CMEventMap> {
  return !!x && typeof (x as any).drainPhase === "function" && typeof (x as any).enterPhase === "function";
}

function normalizeCfg(cfg: ScoreConfig | ScoreConfigSmoke): ScoreConfig {
  const c: any = cfg;

  // smoke style
  if ("pointsPerCell" in c || "pointsPerEntityKill" in c) {
    return {
      pointsPerEnemyKill: Number(c.pointsPerEntityKill ?? 0),
      pointsPerCellKilled: Number(c.pointsPerCell ?? 0),
    };
  }

  // new style
  return {
    pointsPerEnemyKill: Number(c.pointsPerEnemyKill ?? 0),
    pointsPerCellKilled: Number(c.pointsPerCellKilled ?? 0),
  };
}

export class ScoreSystem {
  private readonly bus: EventBus<CMEventMap> | null;
  private readonly session: SessionState;
  private readonly cfg: ScoreConfig;

  // Overload A: dispatcher/smoke
  constructor(session: SessionState, cfg: ScoreConfigSmoke);
  // Overload B: standalone
  constructor(bus: EventBus<CMEventMap>, session: SessionState, cfg: ScoreConfig);
  constructor(a: any, b: any, c?: any) {
    if (isBus(a)) {
      // (bus, session, cfg)
      this.bus = a;
      this.session = b as SessionState;
      this.cfg = normalizeCfg(c as ScoreConfig);
    } else {
      // (session, cfg)
      this.bus = null;
      this.session = a as SessionState;
      this.cfg = normalizeCfg(b as ScoreConfigSmoke);
    }
  }

  /** FlowDispatcher listener API */
  onFlowEvents(events: AnyCMEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case EventType.ENTITY_KILLED: {
          const p = e.payload as any;
          if (p && typeof p.isPlayer === "boolean" && p.isPlayer) break; // nepočítat smrt hráče
          this.session.score += this.cfg.pointsPerEnemyKill;
          break;
        }

        case EventType.CA_CELLS_KILLED: {
          const p = e.payload as CMEventMap[typeof EventType.CA_CELLS_KILLED];
          this.session.score += (p.count | 0) * this.cfg.pointsPerCellKilled;
          break;
        }

        case EventType.ENTITY_DAMAGED:
          break;

        default:
          // nefailovat na budoucí flow eventy
          break;
      }
    }
  }

  /** Standalone režim (jen pokud byl předán bus) */
  update(): void {
    if (!this.bus) throw new Error("[ScoreSystem] update() requires bus (construct with bus, session, cfg)");
    if (this.bus.getCurrentPhase?.() && this.bus.getCurrentPhase?.() !== Phase.Flow) {
      throw new Error("[ScoreSystem] update() must run in Phase.Flow");
    }
    const events = this.bus.drainPhase(Phase.Flow) as AnyCMEvent[];
    if (events.length) this.onFlowEvents(events);
  }
}