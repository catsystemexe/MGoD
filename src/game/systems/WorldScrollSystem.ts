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

    // --- jemné Y-follow (pocit prostoru) - dt stable
    const centerY = this.logicH * 0.5;
    const dy = this.player.pos.y - centerY;

    // target camera offset = "kolik je hráč mimo střed"
    const target = dy;

    // easing rychlost (vyšší = rychleji dohání), dt-stable
    const followK = 2.5; // 1/s (zkus 1.5 až 4.0)
    const t = 1 - Math.exp(-followK * dt);

    // lerp world.scrollY -> target
    this.world.scrollY += (target - this.world.scrollY) * t;
  }
}
