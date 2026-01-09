// src/game/systems/SimulationPhaseSystem.ts
import type { TickContext, AnyEvent } from "../../engine/core/Loop";
import type { CMEventMap } from "../../engine/core/events";
import type { PlayerSystem } from "./PlayerSystem";
import { EnemySystem } from "./EnemySystem";
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
    private readonly enemies: EnemySystem,
    private readonly playerData: PlayerData,
    private readonly playerRef: EntityRef,
    private readonly getActions: () => PlayerActions,
  ) {}

  update(ctx: TickContext, _events: Array<AnyEvent<CMEventMap>>): void {
    const actions = this.getActions();

    // move + cull enemies
    this.enemies.update(ctx.dt);

    this.player.update(ctx.dt, actions);

    const snap: WeaponSnapshot = {
      shipPos: { x: this.playerData.pos.x, y: this.playerData.pos.y },
      aimDir: { x: this.playerData.aimDir.x, y: this.playerData.aimDir.y },
      shipRef: this.playerRef,
    };

    this.weapons.update(ctx.dt, actions, snap);
    this.projectiles.update(ctx.dt);
  }
}