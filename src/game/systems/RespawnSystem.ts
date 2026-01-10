import { EventType, type CMEventMap } from "../../engine/core/events";
import type { AnyCMEvent } from "./FlowDispatcher";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

type SessionState = { lives: number; gameOver: boolean };

type Vec2 = { x: number; y: number };

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export class RespawnSystem {
  private respawnInTicks = 0;

  // ✅ remember where player died
  private lastDeathPos: Vec2 | null = null;

  constructor(
    private session: SessionState,
    private store: EntityStore<any>,
    private getPlayerRef: () => EntityRef,
    private logicW: number,
    private logicH: number,
    private cfg = {
      respawnDelayTicks: 60, // 1s @60Hz
      invulnSec: 1.0,        // 1 sec invincible after respawn
      spawnEnergy: 5,
      // ✅ keep respawn safe inside arena
      respawnMargin: 6,
    }
  ) {}

  onFlowEvents(events: AnyCMEvent[]): void {
    for (const e of events) {
      if (e.type !== EventType.ENTITY_KILLED) continue;

      const p = e.payload as CMEventMap[typeof EventType.ENTITY_KILLED] & { isPlayer?: boolean };
      if (!p?.isPlayer) continue;

      if (this.session.gameOver) return;
      if (this.respawnInTicks > 0) return;

      const pref = this.getPlayerRef();
      const ent: any = this.store.get(pref);

      // ✅ snapshot death position (best effort)
      if (ent?.pos && typeof ent.pos.x === "number" && typeof ent.pos.y === "number") {
        this.lastDeathPos = { x: ent.pos.x, y: ent.pos.y };
      } else {
        this.lastDeathPos = null;
      }

      // Lives--
      this.session.lives = Math.max(0, Number(this.session.lives ?? 0) - 1);

      // freeze player immediately (even last life)
      if (ent) {
        ent.pendingKill = false;
        ent.energy = 0;

        ent.vel = ent.vel ?? { x: 0, y: 0 };
        ent.vel.x = 0;
        ent.vel.y = 0;

        ent.deadT = this.cfg.respawnDelayTicks / 60;
        ent.invulnT = Math.max(Number(ent.invulnT ?? 0), ent.deadT);
        ent.hitFlashT = Math.max(Number(ent.hitFlashT ?? 0), 0.15);
      }

      // LAST LIFE -> GAME OVER
      if (this.session.lives <= 0) {
        this.session.gameOver = true;

        if (ent) {
          ent.deadT = 999999;
          ent.invulnT = 999999;
          ent.vel.x = 0;
          ent.vel.y = 0;
        }

        this.respawnInTicks = 0;
        return;
      }

      // start respawn timer
      this.respawnInTicks = this.cfg.respawnDelayTicks;
      return;
    }
  }

  /** Call once per Simulation tick */
  tick(): void {
    if (this.session.gameOver) return;
    if (this.respawnInTicks <= 0) return;

    this.respawnInTicks -= 1;
    if (this.respawnInTicks > 0) return;

    const pref = this.getPlayerRef();
    const p: any = this.store.get(pref);
    if (!p) return;

    const r = Number(p.radius ?? 3);
    const m = Math.max(0, Number(this.cfg.respawnMargin ?? 0));

    // ✅ choose respawn point: deathPos -> fallback
    const fallback = { x: this.logicW * 0.5, y: this.logicH * 0.8 };
    const src = this.lastDeathPos ?? fallback;

    const rx = clamp(src.x, r + m, this.logicW - r - m);
    const ry = clamp(src.y, r + m, this.logicH - r - m);

    // revive/reset
    p.kind = "player";
    p.pendingKill = false;

    p.pos = { x: rx, y: ry };
    p.vel = p.vel ?? { x: 0, y: 0 };
    p.vel.x = 0;
    p.vel.y = 0;

    p.energyMax = Number(p.energyMax ?? this.cfg.spawnEnergy);
    p.energy = this.cfg.spawnEnergy;

    p.aimDir = p.aimDir ?? { x: 0, y: -1 };

    p.deadT = 0;
    p.invulnT = this.cfg.invulnSec;
    p.hitFlashT = 0;
  }
}
