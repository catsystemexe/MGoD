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
  bombs?: number; // current bomb inventory (gates SPAWN_BOMB)
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
         private readonly world: { scrollX: number; scrollY: number },
           private readonly opts?: {
      onSpawnProjectile?: (p: { x: number; y: number; dx: number; dy: number }) => void;
      onTracer?: (p: { x: number; y: number; dx: number; dy: number }) => void;
      onConsumeBomb?: () => void; // called when a bomb is actually fired (decrement inventory)
      onLaserStart?: (args: { originY: number }) => void;
      onLaserEnd?: () => void;
    },
  ) {}

  private laserDuration: number = 0;
  private laserCooldown: number = 0;
  private laserActive: boolean = false;

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
      this.bus.emitNext(EventType.SPAWN_PROJECTILE, {
        owner,
        origin: { x: ox, y: oy },
      dir: { x: dir.x, y: dir.y },
      weaponTypeId: String(weaponTypeId),
    });

    // Muzzle flash + tracer VFX at the spawn point (WORLD coords; renderVFX
    // subtracts the camera). Previously dead: these callbacks were wired in
    // createGame but never invoked here, so no muzzle/tracer ever emitted.
    this.opts?.onSpawnProjectile?.({ x: ox, y: oy, dx: dir.x, dy: dir.y });
    this.opts?.onTracer?.({ x: ox, y: oy, dx: dir.x, dy: dir.y });
  }
  
   update(dtSec: number, actions: PlayerActions, snap: WeaponSnapshot): void {
     // cooldown decay
     this.st.cdPrimary = Math.max(0, this.st.cdPrimary - dtSec);
     this.st.cdSecondary = Math.max(0, this.st.cdSecondary - dtSec);
     this.st.cdBomb = Math.max(0, this.st.cdBomb - dtSec);

     // const dir = dirFromAimTarget(snap.shipPos, actions.aimTarget);

     const dir = { x: 1, y: 0 }; // default forward fire (no mouse aim)

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

     // W2 LASER — hold mechanic
     const LASER_DURATION = 5.0;
     const LASER_COOLDOWN = 10.0;

     if (this.laserCooldown > 0) {
       this.laserCooldown -= dtSec;
     } else if (this.laserActive) {
       this.laserDuration -= dtSec;
       if (this.laserDuration <= 0) {
         this.laserActive = false;
         this.laserCooldown = LASER_COOLDOWN;
         this.opts?.onLaserEnd?.();
       }
     } else if (actions.fireSecondary && this.laserCooldown <= 0) {
       this.laserActive = true;
       this.laserDuration = LASER_DURATION;
       this.opts?.onLaserStart?.({
         originY: snap.shipPos.y,
       });
     }

     // Gate bomb on inventory: no bomb -> neither emit NOR burn cooldown.
     const hasBomb = Number(snap.bombs ?? 0) > 0;
     this.st.cdBomb = tryFire(
       !!actions.bombPressed && hasBomb,
       this.st.cdBomb,
       Number(bomb?.cooldownSec ?? this.cfg.bombCooldownSec ?? 0.8),
       () => {
          this.opts?.onConsumeBomb?.(); // decrement inventory (owner mutates the player entity)
          this.bus.emitNext(EventType.SPAWN_BOMB, {
            owner: snap.shipRef,
            origin: { x: snap.shipPos.x, y: snap.shipPos.y },
            target: { x: actions.bombTarget.x, y: actions.bombTarget.y },
          });
       },
     );
   }
 
}