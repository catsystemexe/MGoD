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
function tryFire(
  on: boolean,
  cd: number,
  cooldownSec: number,
  fire: () => void,
): number {
  if (!on) return cd;
  if (cd > 0) return cd;
  fire();
  return cooldownSec;
}

function dirFromAimTarget(shipPos: Vec2, aimTarget?: Vec2 | null): Vec2 {
  const ax = (aimTarget && typeof aimTarget.x === "number") ? aimTarget.x : (shipPos.x + 1);
  const ay = (aimTarget && typeof aimTarget.y === "number") ? aimTarget.y : (shipPos.y);

  
  const dx = ax - shipPos.x;
  const dy = ay - shipPos.y;
  return safeUnitDir({ x: dx, y: dy });
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

    const dir = dirFromAimTarget(snap.shipPos, actions.aimTarget);

    this.st.cdPrimary = tryFire(
      !!actions.firePrimary,
      this.st.cdPrimary,
      this.cfg.primary.cooldownSec,
      () => this.emitProjectile("primary", snap.shipRef, snap.shipPos, dir),
    );

    this.st.cdSecondary = tryFire(
      !!actions.fireSecondary,
      this.st.cdSecondary,
      this.cfg.secondary.cooldownSec,
      () => this.emitProjectile("secondary", snap.shipRef, snap.shipPos, dir),
    );

    this.st.cdBomb = tryFire(
      !!actions.bombPressed,
      this.st.cdBomb,
      this.cfg.bombCooldownSec,
      () => {
        this.bus.emitNext(EventType.SPAWN_BOMB, {
          owner: snap.shipRef,
          origin: { ...snap.shipPos },
          target: { ...actions.bombTarget },
        });
      },
    );
  }
  private emitProjectile(weapon: WeaponId, owner: EntityRef, origin: Vec2, dir: Vec2): void {
   
    this.bus.emitNext(EventType.SPAWN_PROJECTILE, {
      weapon,
      owner,
      origin: { ...origin },
      dir: { ...dir },
    });
  }
}
