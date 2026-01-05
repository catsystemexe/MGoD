/**
 * PlayerSystem (CM v3.1)
 * Phase 2: Simulation
 *
 * Responsibilities (MVP):
 * - Move the ship based on actions.move (normalized)
 * - Update sticky aimDir based on actions.aimTarget and ship position
 * - No spawning, no collisions, no damage here
 *
 * Determinism:
 * - Pure math, no Date.now, no random
 * - Same seed + input tape -> same output
 */

import type { PlayerActions } from "../../engine/input/ActionSchema";
import type { EventBus } from "../../engine/core/EventBus";
import { Phase } from "../../engine/core/EventBus";
import type { CMEventMap } from "../../engine/core/events";
import { computeAimDir } from "../../engine/core/aim";
import type { PlayerData } from "../entities/PlayerTypes";

type PlayerBounds = {
  // logic-space bounds (WU) the player is allowed to occupy
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type PlayerConfig = {
  bounds: PlayerBounds;
};

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export class PlayerSystem {
  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly player: PlayerData,
    private readonly cfg: PlayerConfig,
  ) {}

  update(dtSec: number, actions: PlayerActions): void {
    if (this.bus.getCurrentPhase?.() && this.bus.getCurrentPhase?.() !== Phase.Simulation) {
      throw new Error("[PlayerSystem] update() must run in Phase.Simulation");
    }

    // --- Aim dir (sticky)
    this.player.aimDir = computeAimDir(this.player.pos, actions.aimTarget, this.player.aimDir);

    // --- Movement
    const vx = actions.move.x * this.player.speed;
    const vy = actions.move.y * this.player.speed;

    this.player.vel.x = vx;
    this.player.vel.y = vy;

    const nx = this.player.pos.x + vx * dtSec;
    const ny = this.player.pos.y + vy * dtSec;

    // clamp to bounds
    this.player.pos.x = clamp(nx, this.cfg.bounds.minX, this.cfg.bounds.maxX);
    this.player.pos.y = clamp(ny, this.cfg.bounds.minY, this.cfg.bounds.maxY);
  }
}
