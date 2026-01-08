// src/game/systems/SimulationPhaseSystem.ts
import type { TickContext, AnyEvent } from "../../engine/core/Loop";
import type { CMEventMap } from "../../engine/core/events";
import type { PlayerSystem } from "./PlayerSystem";
import type { WeaponSystem, WeaponSnapshot } from "./WeaponSystem";
import type { ProjectileSystem } from "./ProjectileSystem";
import type { PlayerActions } from "../../engine/input/ActionSchema";
import type { PlayerData } from "../entities/PlayerTypes";
import type { EntityRef } from "../../engine/ecs/EntityRef";

export class SimulationPhaseSystem {
  constructor(
    private readonly player: PlayerSystem,
    private readonly weapons: WeaponSystem,
    private readonly projectiles: ProjectileSystem,
    private readonly playerData: PlayerData,
    private readonly playerRef: EntityRef,
    private readonly getActions: () => PlayerActions, // Input glue (MVP stub ok)
  ) {}

  update(ctx: TickContext, _events: Array<AnyEvent<CMEventMap>>): void {
    const actions = this.getActions();

    // player movement + aimDir
    this.player.update(ctx.dt, actions);

    // weapon snapshot
    const snap: WeaponSnapshot = {
      shipPos: { x: this.playerData.pos.x, y: this.playerData.pos.y },
      aimDir: { x: this.playerData.aimDir.x, y: this.playerData.aimDir.y },
      shipRef: this.playerRef,
    };

    // emitNext SPAWN_PROJECTILE / SPAWN_BOMB (owned by Director)
    this.weapons.update(ctx.dt, actions, snap);

    // projectile motion + ttl
    this.projectiles.update(ctx.dt);
  }
}