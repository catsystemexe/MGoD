/**
 * WeaponSystem (CM v3.1)
 * Phase 2: Simulation
 *
 * Responsibilities (MVP):
 * - Convert PlayerActions into spawn REQUEST events
 * - Apply deterministic cooldown (cadence) for hold fire
 * - Emit bomb spawn on buffered trigger
 *
 * Does NOT:
 * - spawn entities directly (SpawnSystem/EntityStore owns that)
 * - do collision or damage
 */

import type { PlayerActions, Vec2 } from "../../engine/input/ActionSchema";
import type { EventBus } from "../../engine/core/EventBus";
import { Phase } from "../../engine/core/EventBus";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { WeaponsConfig, WeaponId } from "../defs/Weapons";

export type WeaponSnapshot = {
  shipPos: Vec2;   // WU
  aimDir: Vec2;    // unit
  shipRef: EntityRef;
};

type WeaponSystemState = {
  cdPrimary: number;
  cdSecondary: number;
  cdBomb: number;
};

function safeUnitDir(dir: Vec2): Vec2 {
  const l = Math.hypot(dir.x, dir.y);
  if (l <= 1e-6) return { x: 1, y: 0 };
  return { x: dir.x / l, y: dir.y / l };
}

export class WeaponSystem {
  private st: WeaponSystemState = { cdPrimary: 0, cdSecondary: 0, cdBomb: 0 };

  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly cfg: WeaponsConfig,
  ) {}

  update(dtSec: number, actions: PlayerActions, snap: WeaponSnapshot): void {
    if (this.bus.getCurrentPhase?.() && this.bus.getCurrentPhase?.() !== Phase.Simulation) {
      throw new Error("[WeaponSystem] update() must run in Phase.Simulation");
    }

    // cooldown decay
    this.st.cdPrimary = Math.max(0, this.st.cdPrimary - dtSec);
    this.st.cdSecondary = Math.max(0, this.st.cdSecondary - dtSec);
    this.st.cdBomb = Math.max(0, this.st.cdBomb - dtSec);

    const dir = safeUnitDir(snap.aimDir);

    // Hold fire primary
    if (actions.firePrimary && this.st.cdPrimary <= 0) {
      this.emitProjectile("primary", snap.shipRef, snap.shipPos, dir);
      this.st.cdPrimary = this.cfg.primary.cooldownSec;
    }

    // Hold fire secondary
    if (actions.fireSecondary && this.st.cdSecondary <= 0) {
      this.emitProjectile("secondary", snap.shipRef, snap.shipPos, dir);
      this.st.cdSecondary = this.cfg.secondary.cooldownSec;
    }

    // Bomb trigger (buffered already in InputManager)
    if (actions.bombPressed && this.st.cdBomb <= 0) {
      this.bus.emit(EventType.SPAWN_BOMB, {
        owner: snap.shipRef,
        origin: { ...snap.shipPos },     // captured at press time
        target: { ...actions.bombTarget }
      });
      this.st.cdBomb = this.cfg.bombCooldownSec;
    }
  }

  private emitProjectile(weapon: WeaponId, owner: EntityRef, origin: Vec2, dir: Vec2): void {
   
    console.log("FIRE tick", (window as any).__CM?.loop?.getTick?.(), dir);
    this.bus.emit(EventType.SPAWN_PROJECTILE, {
      weapon,
      owner,
      origin: { ...origin },
      dir: { ...dir },
    });
  }
}
