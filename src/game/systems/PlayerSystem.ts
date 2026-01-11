import type { PlayerActions } from "../../engine/input/ActionSchema";
import type { EventBus } from "../../engine/core/EventBus";
import { Phase } from "../../engine/core/EventBus";
import type { CMEventMap } from "../../engine/core/events";
import type { PlayerData } from "../entities/PlayerTypes";

type PlayerBounds = {
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

function readAimTarget(actions: PlayerActions, fallback: { x: number; y: number }) {
  const a: any = actions as any;
  const t = a.aimTarget ?? a.aim ?? a.mouse ?? fallback;
  const x = typeof t?.x === "number" ? t.x : fallback.x;
  const y = typeof t?.y === "number" ? t.y : fallback.y;
  return { x, y };
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

    // --- timers
    this.player.invulnT = Math.max(0, Number(this.player.invulnT ?? 0) - dtSec);
    this.player.deadT = Math.max(0, Number(this.player.deadT ?? 0) - dtSec);

    const hf0 = Number((this.player as any).hitFlashT ?? 0);
    const hf = Number.isFinite(hf0) ? hf0 : 0;
    (this.player as any).hitFlashT = hf > 0 ? Math.max(0, hf - dtSec) : 0;

    // --- dead gate (no movement while dead)
    if (Number(this.player.deadT ?? 0) > 0) {
      this.player.vel.x = 0;
      this.player.vel.y = 0;
      return;
    }

    // --- Aim dir (deterministic, from sampled actions)
    const aimTarget = readAimTarget(actions, { x: this.player.pos.x + 1, y: this.player.pos.y });
    const dx = aimTarget.x - this.player.pos.x;
    const dy = aimTarget.y - this.player.pos.y;
    const len = Math.hypot(dx, dy) || 1;

    // --- Movement
    const vx = actions.move.x * this.player.speed;
    const vy = actions.move.y * this.player.speed;

    this.player.vel.x = vx;
    this.player.vel.y = vy;

    const nx = this.player.pos.x + vx * dtSec;
    const ny = this.player.pos.y + vy * dtSec;

    // clamp to bounds, respecting radius
    const r = this.player.radius ?? 0;
    this.player.pos.x = clamp(nx, this.cfg.bounds.minX + r, this.cfg.bounds.maxX - r);
    this.player.pos.y = clamp(ny, this.cfg.bounds.minY + r, this.cfg.bounds.maxY - r);
  }
}