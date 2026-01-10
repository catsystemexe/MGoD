import { EventType, type CMEventMap } from "../../engine/core/events";
import type { AnyCMEvent } from "./FlowDispatcher";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { EntityRef } from "../../engine/ecs/EntityRef";

type SessionState = {
  lives: number;
  gameOver: boolean;
  lastDeathPos?: { x: number; y: number };
};

export class RespawnSystem {
  private respawnInTicks = 0;

  constructor(
    private session: SessionState,
    private store: EntityStore<any>,
    private getPlayerRef: () => EntityRef,
    private logicW: number,
    private logicH: number,
    private cfg = {
      respawnDelayTicks: 60, // 1s @60Hz
      invulnSec: 1.0,        // 1 sec invincible
      spawnEnergy: 5,
    }
  ) {}

  onFlowEvents(events: AnyCMEvent[]): void {
    for (const e of events) {
      if (e.type !== EventType.ENTITY_KILLED) continue;

      const p = e.payload as CMEventMap[typeof EventType.ENTITY_KILLED] & { isPlayer?: boolean };
      if (!p?.isPlayer) continue;

      if (this.respawnInTicks > 0) return; // already waiting

      // ✅ capture last death position from the current player entity (still exists until cleanup)
      try {
        const pref = this.getPlayerRef();
        const pe: any = this.store.get(pref);
        if (pe?.pos && typeof pe.pos.x === "number" && typeof pe.pos.y === "number") {
          this.session.lastDeathPos = { x: pe.pos.x, y: pe.pos.y };
        }
      } catch {
        // ignore (fail-safe)
      }

      this.session.lives -= 1;
      if (this.session.lives < 0) this.session.lives = 0;

      if (this.session.lives === 0) {
        this.session.gameOver = true;
        return;
      }

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

    const fallback = { x: this.logicW * 0.5, y: this.logicH * 0.8 };
    const spawnPos = this.session.lastDeathPos ?? fallback;

    // ✅ reset player state in-place
    p.kind = "player";
    p.pos = { x: spawnPos.x, y: spawnPos.y };
    p.vel = { x: 0, y: 0 };

    p.radius = Number.isFinite(Number(p.radius)) ? Number(p.radius) : 3;

    // energy
    const max0 = Number(p.energyMax ?? this.cfg.spawnEnergy);
    p.energyMax = Number.isFinite(max0) && max0 > 0 ? max0 : this.cfg.spawnEnergy;
    p.energy = this.cfg.spawnEnergy;

    p.pendingKill = false;

    // aim dir keep if exists
    if (!p.aimDir) p.aimDir = { x: 0, y: -1 };

    // ✅ spawn i-frames
    p.invulnT = this.cfg.invulnSec;

    // ✅ clear death gate
    p.deadT = 0;
  }
}
