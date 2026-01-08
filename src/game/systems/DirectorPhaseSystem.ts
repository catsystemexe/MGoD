// src/game/systems/DirectorPhaseSystem.ts
import type { TickContext, AnyEvent } from "../../engine/core/Loop";
import type { CMEventMap } from "../../engine/core/events";
import type { DirectorSystem } from "./DirectorSystem";
import type { SpawnSystem } from "./SpawnSystem";
import type { SessionState } from "../data/SessionState";

export class DirectorPhaseSystem {
  constructor(
    private readonly session: SessionState,
    private readonly director: DirectorSystem,
    private readonly spawns: SpawnSystem,
  ) {}

  update(ctx: TickContext, events: Array<AnyEvent<CMEventMap>>): void {
    // authoritative clock/state
    this.session.tick = ctx.tick;
    this.session.timeSec += ctx.dt;

    // decide NEXT tick spawns (emitNext)
    this.director.update({ tick: ctx.tick, timeSec: this.session.timeSec });

    // apply THIS tick Director-owned requests (from previous tick emitNext)
    this.spawns.update(ctx, events);
  }
}