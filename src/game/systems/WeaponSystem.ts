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
import type { WeaponsConfig, WeaponSlotId, WeaponDB, WeaponTypeId } from "../defs/Weapons";

export type WeaponSnapshot = {
  shipRef: EntityRef;
  shipPos: Vec2;
  shipVel?: Vec2;
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
            private readonly db: WeaponDB,
           private readonly world: { scrollY: number },
           private readonly opts?: {
      onSpawnProjectile?: (p: { x: number; y: number; dx: number; dy: number }) => void;
      onTracer?: (p: { x: number; y: number; dx: number; dy: number }) => void;
    },
  ) {}

  private emitProjectile(
    weaponTypeId: WeaponTypeId,
    owner: EntityRef,
    shipPos: Vec2,
    dirIn: Vec2,
    shipVel: Vec2 | undefined,
    dtSec: number,
  ): void {
    const dir = safeUnitDir(dirIn);

    // spawn point: před přídí (tweak)
    const MUZZLE = 12; // px dopředu od středu ship
    const ox = shipPos.x + dir.x * MUZZLE;
    const oy = shipPos.y + dir.y * MUZZLE;

        // A+ cameraY: projectiles live in worldY, player is screenY
        const sy = Number((this.world as any)?.scrollY ?? 0);

    this.bus.emitNext(EventType.SPAWN_PROJECTILE, {
      owner,
      origin: { x: ox, y: oy + sy },
      dir: { x: dir.x, y: dir.y },
      weaponTypeId: String(weaponTypeId),
    });
      // tracer hook (same space as entities)
      // ✅ MVP: tracer is in screen-space (parallax scroll does NOT shift entities)
      this.opts?.onTracer?.({ x: ox, y: oy, dx: dir.x, dy: dir.y });
  }
  
   update(dtSec: number, actions: PlayerActions, snap: WeaponSnapshot): void {
     // cooldown decay
     this.st.cdPrimary = Math.max(0, this.st.cdPrimary - dtSec);
     this.st.cdSecondary = Math.max(0, this.st.cdSecondary - dtSec);
     this.st.cdBomb = Math.max(0, this.st.cdBomb - dtSec);

     const dir = dirFromAimTarget(snap.shipPos, actions.aimTarget);

     const primaryId = this.cfg.primary;
     const secondaryId = this.cfg.secondary;
     const bombId = this.cfg.bomb;

     const primary = this.db[primaryId];
     const secondary = this.db[secondaryId];
     const bomb = this.db[bombId];

     this.st.cdPrimary = tryFire(
       !!actions.firePrimary,
       this.st.cdPrimary,
       Number(primary?.cooldownSec ?? 0.12),
       () => this.emitProjectile(primaryId, snap.shipRef, snap.shipPos, dir, snap.shipVel, dtSec),
     );

     this.st.cdSecondary = tryFire(
       !!actions.fireSecondary,
       this.st.cdSecondary,
       Number(secondary?.cooldownSec ?? 0.25),
       () => this.emitProjectile(secondaryId, snap.shipRef, snap.shipPos, dir, snap.shipVel, dtSec),
     );

     this.st.cdBomb = tryFire(
       !!actions.bombPressed,
       this.st.cdBomb,
       Number(bomb?.cooldownSec ?? this.cfg.bombCooldownSec ?? 0.8),
       () => {
         const sy = Number((this.world as any)?.scrollY ?? 0);

         this.bus.emitNext(EventType.SPAWN_BOMB, {
           owner: snap.shipRef,
           origin: { x: snap.shipPos.x, y: snap.shipPos.y + sy },
           target: { x: actions.bombTarget.x, y: actions.bombTarget.y + sy },
         });
       },
     );
   }
 
}