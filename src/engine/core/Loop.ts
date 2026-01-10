// src/engine/core/Loop.ts
import { Phase, type EventBus, type EventMap } from "./EventBus";

export type TickContext = {
  tick: number;
  dt: number;
};

export type AnyEvent<EM extends EventMap> = {
  type: keyof EM;
  payload: EM[keyof EM];
};

export type LoopDeps<EM extends EventMap> = {
  eventBus: EventBus<EM>;

  input?: { sample: (ctx: TickContext) => void };

  director?: { update: (ctx: TickContext, events: AnyEvent<EM>[]) => void };
  simulation?: { update: (ctx: TickContext, events: AnyEvent<EM>[]) => void };
  collision?: { update: (ctx: TickContext, events: AnyEvent<EM>[]) => void };
  impact?: { update: (ctx: TickContext, events: AnyEvent<EM>[]) => void };
  flow?: { update: (ctx: TickContext, events: AnyEvent<EM>[]) => void };
  audio?: { update: (ctx: TickContext, events: AnyEvent<EM>[]) => void };
  cleanup?: { update: (ctx: TickContext, events: AnyEvent<EM>[]) => void };
};

export class Loop<EM extends EventMap> {
  private acc = 0;
  private tick = 0;
  private readonly dt = 1 / 60;
  private paused = false;
  
  constructor(private deps: LoopDeps<EM>) {
    if (!deps?.eventBus) throw new Error("[Loop] eventBus missing");
  }

  public step(frameDtSec: number): void {
    const capped = Math.min(frameDtSec, 0.25);
    this.acc += capped;

    while (this.acc >= this.dt) {
      this.fixedTick();
      this.acc -= this.dt;
    }
  }
  public setPaused(on: boolean): void {
    this.paused = on;
  }

  public togglePause(): void {
    this.paused = !this.paused;
  }

  public isPaused(): boolean {
    return this.paused;
  }
  
  public stepOneTick(): void {
    this.fixedTick();
  }

  public getTick(): number {
    return this.tick;
  }

  private runPhase(
    phase: Phase,
    ctx: TickContext,
    fn?: (ctx: TickContext, events: AnyEvent<EM>[]) => void,
  ): void {
    const bus = this.deps.eventBus;

    bus.enterPhase(phase);

    const events = bus.drainPhase(phase) as AnyEvent<EM>[];

    // DEBUG: co se v jaké fázi skutečně drenuje
    if (events.length > 0) {
      const types = events.map((e: any) => e.type).join(",");
      console.log("[LOOP][DRAIN]", phase, "n=", events.length, types);
    }

    fn?.(ctx, events);
  }

  
 
  private fixedTick(): void {
    if (this.paused) return;
    const ctx: TickContext = { tick: this.tick, dt: this.dt };
    const bus = this.deps.eventBus;

    bus.beginTick(this.tick);

    this.runPhase(Phase.Input, ctx, (c) => this.deps.input?.sample(c));
    this.runPhase(Phase.Director, ctx, (c, e) => this.deps.director?.update(c, e));
    this.runPhase(Phase.Simulation, ctx, (c, e) => this.deps.simulation?.update(c, e));
    this.runPhase(Phase.Collision, ctx, (c, e) => this.deps.collision?.update(c, e));
    this.runPhase(Phase.Impact, ctx, (c, e) => this.deps.impact?.update(c, e));
    this.runPhase(Phase.Flow, ctx, (c, e) => this.deps.flow?.update(c, e));
    this.runPhase(Phase.Audio, ctx, (c, e) => this.deps.audio?.update(c, e));
    this.runPhase(Phase.Cleanup, ctx, (c, e) => this.deps.cleanup?.update(c, e));

    bus.endTickAndSwap();
    this.tick++;
  }
}
