// src/game/systems/DirectorPhaseSystem.ts
import type { TickContext, AnyEvent } from "../../engine/core/Loop";
import type { CMEventMap } from "../../engine/core/events";
import type { DirectorSystem } from "./DirectorSystem";
import type { SessionState } from "../data/SessionState";

export class DirectorPhaseSystem {
  constructor(
    private readonly session: SessionState,
    private readonly director: DirectorSystem,
  ) {}

  update(ctx: TickContext, _events: Array<AnyEvent<CMEventMap>>): void {
    // authoritative clock/state
    this.session.tick = ctx.tick;
    this.session.timeSec += ctx.dt;

    // ✅ MUST include dt, because DirectorSystem requires it
    this.director.update(
      { tick: ctx.tick, dt: ctx.dt, timeSec: this.session.timeSec } as any,
      []
    );
  }
}
