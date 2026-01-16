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
    private readonly opts?: {
      onSpawnProjectile?: (p: { x: number; y: number; dx: number; dy: number }) => void;
      onTracer?: (p: { x: number; y: number; dx: number; dy: number }) => void;
    },
  ) {}

    update(dtSec: number, actions: PlayerActions, snap: WeaponSnapshot): void {
      // NOTE: Phase guard removed (EventBus doesn't expose getCurrentPhase in current typings).
      // If you want this check back, add getCurrentPhase() to EventBus implementation + type.

    // cooldown decay
    this.st.cdPrimary = Math.max(0, this.st.cdPrimary - dtSec);
    this.st.cdSecondary = Math.max(0, this.st.cdSecondary - dtSec);
    this.st.cdBomb = Math.max(0, this.st.cdBomb - dtSec);

    const dir = dirFromAimTarget(snap.shipPos, actions.aimTarget);

    this.st.cdPrimary = tryFire(
      !!actions.firePrimary,
      this.st.cdPrimary,
      this.cfg.primary.cooldownSec,
      () => this.emitProjectile("primary", snap.shipRef, snap.shipPos, dir, snap.shipVel, dtSec),
    );

    this.st.cdSecondary = tryFire(
      !!actions.fireSecondary,
      this.st.cdSecondary,
      this.cfg.secondary.cooldownSec,
      () => this.emitProjectile("secondary", snap.shipRef, snap.shipPos, dir, snap.shipVel, dtSec),
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
  private emitProjectile(
    weapon: WeaponId,
    owner: EntityRef,
    origin: Vec2,
    dir: Vec2,
    vel: Vec2 | undefined,
    dtSec: number,
  ): void {
    // --- muzzle offset: spawn projectile in front of ship nose ---
    // NOTE: tune these constants to match core.png (ship frame 56x56, pivot 28,28)
    const MUZZLE_OFFSET_PX = 26; // start with ~half sprite; tweak (22..30)

    const o = origin; // ship center
    const mx = o.x + dir.x * MUZZLE_OFFSET_PX;
    const my = o.y + dir.y * MUZZLE_OFFSET_PX;

    this.bus.emitNext(EventType.SPAWN_PROJECTILE, {
      weapon,
      owner,
      origin: { x: mx, y: my },
      dir: { ...dir },
    });

    // cosmetic hooks (muzzle + tracer) — lead to match render interpolation
    const vx = vel?.x ?? 0;
    const vy = vel?.y ?? 0;

    // lead = půl ticku (nejbližší tomu, co vidíš v renderu)
    const lead = 0.5 * dtSec;

    const ox = mx + vx * lead;
    const oy = my + vy * lead;

    this.opts?.onSpawnProjectile?.({ x: ox, y: oy, dx: dir.x, dy: dir.y });
    this.opts?.onTracer?.({ x: ox, y: oy, dx: dir.x, dy: dir.y });
}
}
