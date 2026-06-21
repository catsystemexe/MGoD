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

type WorldScroll = { scrollX: number; scrollY: number };

type PlayerConfig = {
  bounds: PlayerBounds;
  world?: WorldScroll;
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
  private prevScrollX: number | undefined;
  private prevScrollY: number | undefined;

  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly player: PlayerData,
    private readonly cfg: PlayerConfig,
  ) {}

  update(dtSec: number, actions: PlayerActions): void {
    // Phase check je OK jen pokud EventBus getCurrentPhase skutečně existuje:
    // const ph = (this.bus as any).getCurrentPhase?.();
    // if (ph && ph !== Phase.Simulation) throw new Error("[PlayerSystem] update() must run in Phase.Simulation");

    // --- scroll delta: carry player with autoscroll so world position tracks
    const curSX = Number(this.cfg.world?.scrollX ?? 0);
    const curSY = Number(this.cfg.world?.scrollY ?? 0);
    const dsx = curSX - (this.prevScrollX ?? curSX);
    const dsy = curSY - (this.prevScrollY ?? curSY);
    this.prevScrollX = curSX;
    this.prevScrollY = curSY;

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

    // --- World->screen for this tick.
    // player.pos is WORLD space; input/aim targets are SCREEN space.
    const sx = Number(this.cfg.world?.scrollX ?? 0);
    const sy = Number(this.cfg.world?.scrollY ?? 0);
    const screenX = this.player.pos.x - sx;
    const screenY = this.player.pos.y - sy;

    // --- Aim dir (deterministic, from sampled actions). aimTarget is SCREEN space,
    //     so compare against the player's SCREEN position.
    const aimTarget = readAimTarget(actions, { x: screenX + 1, y: screenY });
    const dx = aimTarget.x - screenX;
    const dy = aimTarget.y - screenY;
    const len = Math.hypot(dx, dy);

    // --- Aim dir + rot (stored on player entity for renderer)
    const pAny2 = this.player as any;

    // ensure aimDir exists
    if (!pAny2.aimDir) pAny2.aimDir = { x: 1, y: 0 };

    // normalized aim dir; keep the last valid direction when target overlaps player
    if (len > 0) {
      pAny2.aimDir.x = dx / len;
      pAny2.aimDir.y = dy / len;

      // rotation in logic space (y down). Renderer/SpriteProgram flips NDC Y => use -atan2
      const ROT_OFFSET = 0; // tweak if your sprite points up/left/etc.
      pAny2.rot = Math.atan2(dy, dx) + ROT_OFFSET;
      if (!Number.isFinite(pAny2.rot)) pAny2.rot = 0;
    }

    
    /// --- Movement (smooth accel/decel) + posPrev for render interpolation
    const pAny = this.player as any;

    // snapshot previous position for render lerp
    if (!pAny.posPrev) pAny.posPrev = { x: this.player.pos.x, y: this.player.pos.y };
    else { pAny.posPrev.x = this.player.pos.x; pAny.posPrev.y = this.player.pos.y; }

    // Dead zone — filtruje micro-jitter myši
    const moveX = Math.abs(actions.move.x) > 0.06 ? actions.move.x : 0;
    const moveY = Math.abs(actions.move.y) > 0.06 ? actions.move.y : 0;

    // target velocity (arcade)
    const tvx = moveX * this.player.speed;
    const tvy = moveY * this.player.speed;

    // smoothing: faster stop than start (feels tight)
    const accel = 20; // 1/s
    const decel = 300; // 1/s
    const hasInput = (moveX !== 0 || moveY !== 0);
    const k = hasInput ? accel : decel;

    // exp smoothing stable across dt jitter
    const t = 1 - Math.exp(-k * dtSec);

    this.player.vel.x = this.player.vel.x + (tvx - this.player.vel.x) * t;
    this.player.vel.y = this.player.vel.y + (tvy - this.player.vel.y) * t;
    
    // clamp to bounds, respecting radius.
    const r = this.player.radius ?? 0;

    // Integrate + clamp in SCREEN space (identical to legacy behavior), then lift
    // back to WORLD by re-adding the current scroll. bounds stay screen-fixed, so the
    // player occupies the same on-screen rectangle as before regardless of scroll.
    const nsx = screenX + this.player.vel.x * dtSec;
    const nsy = screenY + this.player.vel.y * dtSec;

    const csx = clamp(nsx, this.cfg.bounds.minX + r, this.cfg.bounds.maxX - r);
    const csy = clamp(nsy, this.cfg.bounds.minY + r, this.cfg.bounds.maxY - r);

    this.player.pos.x = csx + sx + dsx;
    this.player.pos.y = csy + sy + dsy;
  }
}