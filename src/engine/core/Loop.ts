/**
 * Captain Meow (CM) – Loop (v3.1)
 * Fixed timestep 60Hz + phase orchestration.
 *
 * Contract:
 * - Each tick executes phases 0..7 in strict order.
 * - EventBus phase ownership must be enforced via enterPhase/drainPhase.
 * - Cleanup is ALWAYS last (commit kills, then EventBus swap).
 */

import { Phase, type EventBus } from "./EventBus";

export type TickContext = {
  tick: number;
  dt: number; // fixed dt (1/60)
};

export type LoopDeps = {
  // Mandatory core pieces
  eventBus: EventBus<any>; // typed in Bootstrap with CMEventMap
  // Optional hooks (provided by Bootstrap)
  input?: { sample: () => void };
  director?: { update: (ctx: TickContext) => void };
  simulation?: { update: (ctx: TickContext) => void };
  collision?: { update: (ctx: TickContext) => void };
  impact?: { update: (ctx: TickContext) => void };
  flow?: { update: (ctx: TickContext) => void };
  audio?: { update: (ctx: TickContext) => void };
  cleanup?: { update: (ctx: TickContext) => void };
};

export class Loop {
  private acc = 0;
  private tick = 0;

  // fixed 60Hz
  private readonly dt = 1 / 60;

  constructor(private deps: LoopDeps) {}

  /** Advance time in seconds (frame delta). Will run 0..N fixed ticks. */
  public step(frameDtSec: number): void {
    // cap to prevent spiral-of-death in dev if tab is inactive
    const capped = Math.min(frameDtSec, 0.25);
    this.acc += capped;

    while (this.acc >= this.dt) {
      this.fixedTick();
      this.acc -= this.dt;
    }
  }

  /** Run exactly one fixed tick (useful for debug step). */
  public stepOneTick(): void {
    this.fixedTick();
  }

  public getTick(): number {
    return this.tick;
  }

  private fixedTick(): void {
    const ctx: TickContext = { tick: this.tick, dt: this.dt };

    // start-of-tick
    this.deps.eventBus.beginTick(this.tick);

    // Phase 0: Input snapshot
    this.deps.eventBus.enterPhase(Phase.Input);
    this.deps.input?.sample();

    // Phase 1: Director & Spawns
    this.deps.eventBus.enterPhase(Phase.Director);
    this.deps.director?.update(ctx);

    // Phase 2: Simulation
    this.deps.eventBus.enterPhase(Phase.Simulation);
    this.deps.simulation?.update(ctx);

    // Phase 3: Collision (detection-only)
    this.deps.eventBus.enterPhase(Phase.Collision);
    this.deps.collision?.update(ctx);

    // Phase 4: Impact (drains collision-owned events, emits impact results)
    this.deps.eventBus.enterPhase(Phase.Impact);
    this.deps.impact?.update(ctx);

    // Phase 5: Flow (score/game over)
    this.deps.eventBus.enterPhase(Phase.Flow);
    this.deps.flow?.update(ctx);

    // Phase 6: Audio (non-deterministic side effects allowed, but event input is deterministic)
    this.deps.eventBus.enterPhase(Phase.Audio);
    this.deps.audio?.update(ctx);

    // Phase 7: Cleanup (commit kills + EventBus swap)
    this.deps.eventBus.enterPhase(Phase.Cleanup);
    this.deps.cleanup?.update(ctx);

    // Must be last. If any events remain in qNow -> fail-fast policy should complain here.
    this.deps.eventBus.endTickAndSwap();

    this.tick++;
  }
}
