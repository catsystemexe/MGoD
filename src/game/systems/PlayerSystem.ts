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
    // Phase check je OK jen pokud EventBus getCurrentPhase skutečně existuje:
    // const ph = (this.bus as any).getCurrentPhase?.();
    // if (ph && ph !== Phase.Simulation) throw new Error("[PlayerSystem] update() must run in Phase.Simulation");

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

    // --- Aim dir + rot (stored on player entity for renderer)
    const pAny2 = this.player as any;

    // ensure aimDir exists
    if (!pAny2.aimDir) pAny2.aimDir = { x: 1, y: 0 };

    // normalized aim dir
    pAny2.aimDir.x = dx / len;
    pAny2.aimDir.y = dy / len;

    // rotation in logic space (y down). Renderer/SpriteProgram flips NDC Y => use -atan2
    const ROT_OFFSET = 0; // tweak if your sprite points up/left/etc.
    pAny2.rot = Math.atan2(dy, dx) + ROT_OFFSET;
    if (!Number.isFinite(pAny2.rot)) pAny2.rot = 0;

    
    /// --- Movement (smooth accel/decel) + posPrev for render interpolation
    const pAny = this.player as any;

    // snapshot previous position for render lerp
    if (!pAny.posPrev) pAny.posPrev = { x: this.player.pos.x, y: this.player.pos.y };
    else { pAny.posPrev.x = this.player.pos.x; pAny.posPrev.y = this.player.pos.y; }

    // target velocity (arcade)
    const tvx = actions.move.x * this.player.speed;
    const tvy = actions.move.y * this.player.speed;

    // smoothing: faster stop than start (feels tight)
    const accel = 22; // 1/s
    const decel = 28; // 1/s
    const hasInput = (actions.move.x !== 0 || actions.move.y !== 0);
    const k = hasInput ? accel : decel;

    // exp smoothing stable across dt jitter
    const t = 1 - Math.exp(-k * dtSec);

    this.player.vel.x = this.player.vel.x + (tvx - this.player.vel.x) * t;
    this.player.vel.y = this.player.vel.y + (tvy - this.player.vel.y) * t;

    const nx = this.player.pos.x + this.player.vel.x * dtSec;
    const ny = this.player.pos.y + this.player.vel.y * dtSec;

    // clamp to bounds, respecting radius
    const r = this.player.radius ?? 0;
    this.player.pos.x = clamp(nx, this.cfg.bounds.minX + r, this.cfg.bounds.maxX - r);
    this.player.pos.y = clamp(ny, this.cfg.bounds.minY + r, this.cfg.bounds.maxY - r);
  }
}