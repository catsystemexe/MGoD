import type { TickContext, AnyEvent } from "../../engine/core/Loop";
import type { CMEventMap } from "../../engine/core/events";
import type { PlayerActions } from "../../engine/input/ActionSchema";
import type { WeaponSnapshot, WeaponSystem } from "./WeaponSystem";

export type WeaponRuntime = {
  actions: PlayerActions;
  snap: WeaponSnapshot;
};

export class WeaponPhaseSystem {
  constructor(
    private readonly weapons: WeaponSystem,
    private readonly rt: WeaponRuntime,
  ) {}

  update(ctx: TickContext, _events: Array<AnyEvent<CMEventMap>>): void {
    this.weapons.update(ctx.dt, this.rt.actions, this.rt.snap);
  }
}