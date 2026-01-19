import type { WorldState } from "../data/WorldState";
import type { PlayerData } from "../entities/PlayerTypes";

export class WorldScrollSystem {
  constructor(
    private readonly world: WorldState,
    private readonly player: PlayerData,
    private readonly logicW: number,
    private readonly logicH: number
  ) {}

  update(dt: number): void {
    // --- konstantní autoscroll doprava
    this.world.scrollX += this.world.speedX * dt;

    // --- Y-follow disabled (MVP): keep camera Y fixed
      this.world.scrollY = 0;
}
}
