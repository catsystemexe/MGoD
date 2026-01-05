import { EventBus, Phase } from "./EventBus";
import { CM_EVENT_OWNERSHIP } from "./EventOwnershipMap";
import { EventType, type CMEventMap } from "./events";

import { EntityStore } from "../ecs/EntityStore";
import type { BaseEntity } from "../ecs/ComponentTypes";
import { DamageSystem } from "../systems/DamageSystem";

import { makeSessionState } from "../../game/data/SessionState";
import { FlowDispatcher } from "../../game/systems/FlowDispatcher";
import { ScoreSystem } from "../../game/systems/ScoreSystem";
import { GameOverSystem } from "../../game/systems/GameOverSystem";

// --- helpers
function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("[SMOKE] " + msg);
}

interface TestEntity extends BaseEntity {
  hp: number;
  kind: "player" | "enemy";
  pendingKill: boolean; // if BaseEntity already has it, TS will merge
}

function main() {
  // Core services
  const bus = new EventBus<CMEventMap>(CM_EVENT_OWNERSHIP, {
    maxEventsPerTick: 512,
    failFast: true,
    dropLeftoversInProd: true,
    onWarn: (m) => console.warn(m),
    onError: (m) => console.error(m),
  });

  // State
  const session = makeSessionState();

  // ECS
  const store = new EntityStore<TestEntity>(16);

  const player = store.spawn(e => {
    e.kind = "player";
    e.hp = 10;
  });

  const enemy = store.spawn(e => {
    e.kind = "enemy";
    e.hp = 5;
  });

  // Systems
  const damage = new DamageSystem(bus, store, {
    projectileHitEnemyDamage: 3,
    playerHitEnemyDamage: 999,
  });

  const score = new ScoreSystem(session, { pointsPerCell: 1, pointsPerEntityKill: 0 });
  const gameOver = new GameOverSystem(session);
  const flow = new FlowDispatcher(bus, [score, gameOver]);

  // -------------------------
  // TICK 0
  // -------------------------
  bus.beginTick(0);

  // Phase 0: Input (noop in smoke)
  bus.enterPhase(Phase.Input);

  // Phase 1: Director (noop)
  bus.enterPhase(Phase.Director);

  // Phase 2: Simulation (noop)
  bus.enterPhase(Phase.Simulation);

  // Phase 3: Collision (emit some hits)
  bus.enterPhase(Phase.Collision);

  // 1) projectile hits enemy
  bus.emit(EventType.PROJECTILE_HIT_ENEMY, { projectile: { slot: 7, gen: 1 }, enemy });

  // 2) projectile hits CA at position -> will produce CA_CELLS_KILLED (in real CAImpactSystem)
  // For loop smoke we simulate Impact emitting CA_CELLS_KILLED directly to test Flow/score.
  bus.emit(EventType.PROJECTILE_HIT_CA, { projectile: { slot: 7, gen: 1 }, x: 10, y: 10 });

  // Phase 4: Impact
  bus.enterPhase(Phase.Impact);

  // Damage applies to enemy
  damage.update();

  // Simulate CAImpact batching result (as if CAImpactSystem ran)
  bus.emit(EventType.CA_CELLS_KILLED, { count: 12, source: "explosion" });

  // Phase 5: Flow
  bus.enterPhase(Phase.Flow);
  flow.update();

  // Phase 6: Audio (noop drain for smoke, but it must exist if some events are audio-owned)
  bus.enterPhase(Phase.Audio);
  bus.drainPhase(Phase.Audio);

  // Phase 7: Cleanup
  bus.enterPhase(Phase.Cleanup);
  store.cleanup();
  bus.endTickAndSwap();

  // Assertions after tick 0
  const e1 = store.get(enemy);
  assert(e1 !== null, "enemy must still exist after tick0");
  assert(e1!.hp === 2, "enemy hp should be 2 after 3 dmg");
  assert(session.score === 12, "score should equal CA killed count");

  // -------------------------
  // TICK 1: second hit kills enemy
  // -------------------------
  bus.beginTick(1);

  bus.enterPhase(Phase.Input);
  bus.enterPhase(Phase.Director);
  bus.enterPhase(Phase.Simulation);

  bus.enterPhase(Phase.Collision);
  bus.emit(EventType.PROJECTILE_HIT_ENEMY, { projectile: { slot: 7, gen: 1 }, enemy });

  bus.enterPhase(Phase.Impact);
  damage.update();

  bus.enterPhase(Phase.Flow);
  flow.update();

  bus.enterPhase(Phase.Audio);
  bus.drainPhase(Phase.Audio);

  bus.enterPhase(Phase.Cleanup);
  store.cleanup();
  bus.endTickAndSwap();

  // Enemy should be gone after cleanup
  assert(store.get(enemy) === null, "enemy must be removed after lethal hit + cleanup");

  console.log("[SMOKE] Loop OK ✅");
}

main();
