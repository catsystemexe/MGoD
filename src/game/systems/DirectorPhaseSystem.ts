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

    // let director run spawns for NEXT tick
    this.director.update(
      { tick: ctx.tick, dt: ctx.dt, timeSec: this.session.timeSec } as any,
      []
    );

    // keep wave number in session for HUD
    const cur = this.director.getHUDInfo().current;
    if (typeof cur === "number" && Number.isFinite(cur)) {
      this.session.wave = cur;
    }
  }
}
