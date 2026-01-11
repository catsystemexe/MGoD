import { EventBus, Phase } from "../../engine/core/EventBus";
import { CM_EVENT_OWNERSHIP } from "../../engine/core/EventOwnershipMap";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { makeSessionState } from "../data/SessionState";
import { FlowDispatcher } from "./FlowDispatcher";
import { ScoreSystem } from "./ScoreSystem";
import { GameOverSystem } from "./GameOverSystem";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

function main() {
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 256,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  const session = makeSessionState();

  // MVP score rules: only CA cells add score, entity kills add 0.
  const score = new ScoreSystem(session, { pointsPerCell: 1, pointsPerEntityKill: 0 });
  const gameOver = new GameOverSystem(session);
  const flow = new FlowDispatcher([score, gameOver]);

  bus.beginTick(0);

  // ---- Flow-owned events should be emitted in Flow phase (ownership guard)
  const caCount = 3;

  bus.enterPhase(Phase.Flow);
  bus.emit(EventType.CA_CELLS_KILLED, { count: caCount, source: "test" });

  bus.emit(EventType.ENTITY_DAMAGED, {
    target: { slot: 2, gen: 1 },
    amount: 3,
    hpAfter: 7,
    source: "test",
  });

  bus.emit(EventType.ENTITY_KILLED, {
    target: { slot: 3, gen: 1 },
    source: "projectile",
    isPlayer: false,
  });

  // Drain + dispatch Flow
  bus.enterPhase(Phase.Flow);
  const flowEvents = bus.drainPhase(Phase.Flow);
  flow.dispatch(flowEvents as any);

  assert(session.score === caCount, "score must equal CA killed count in MVP");
  assert(session.gameOver === false, "gameOver should remain false");

  // ---- Player death: ENTITY_KILLED is Flow-owned => must be emitted in Flow phase
  bus.enterPhase(Phase.Flow);
  bus.emit(EventType.ENTITY_KILLED, {
    target: { slot: 1, gen: 1 },
    source: "contact",
    isPlayer: true,
  });

  bus.enterPhase(Phase.Flow);
  const flowEvents2 = bus.drainPhase(Phase.Flow);
  flow.dispatch(flowEvents2 as any);

  assert(session.gameOver === true, "gameOver must become true after player kill");

  // End tick must not complain about leftovers
  bus.enterPhase(Phase.Cleanup);
  bus.endTickAndSwap();

  console.log("[SMOKE] Flow OK ✅");
}

main();