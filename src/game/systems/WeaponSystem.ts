/**
 * WeaponSystem (CM v3.1)
 * Phase 2: Simulation
 *
 * Responsibilities (MVP):
 * - Own normalized W1/W2 runtime slots
 * - Convert PlayerActions into spawn REQUEST events / beam callbacks
 * - Apply deterministic cooldown/resource state for hold fire
 * - Emit bomb spawn on buffered trigger (legacy path preserved)
 *
 * Does NOT:
 * - spawn projectile entities directly (SpawnSystem/EntityStore owns that)
 * - do collision or damage
 */

import type { PlayerActions, Vec2 } from "../../engine/input/ActionSchema";
import type { EventBus } from "../../engine/core/EventBus";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import {
  ACTIVE_W1_WEAPON_ID,
  ACTIVE_W2_WEAPON_ID,
  getWeaponMaxLevel,
  normalizeWeaponLevel,
  resolveEffectiveWeaponSpec,
  type EffectiveWeaponSpec,
  type WeaponDB,
  type WeaponInstance,
  type WeaponRuntimeSnapshot,
  type WeaponsConfig,
  type WeaponSlotId,
  type WeaponSlotSnapshot,
  type WeaponTypeId,
} from "../defs/Weapons";

export type WeaponSnapshot = {
  shipRef: EntityRef;
  shipPos: Vec2;
  shipVel?: Vec2;
  bombs?: number; // current bomb inventory (gates SPAWN_BOMB)
};

type WeaponSystemState = {
  cdBomb: number;
};

type BeamRuntime = {
  activeDurationRemainingSec: number;
  activeDurationTotalSec: number;
};

const W1_SHOT_SPACING_PX = 10;
const W1_SPREAD_WEAPON_ID = "w1.spread";

const SHOT_ANGLES_DEG_BY_WEAPON_LEVEL: Record<string, ReadonlyArray<ReadonlyArray<number>>> = {
  [W1_SPREAD_WEAPON_ID]: [
    [-15, 15],
    [-45, 0, 45],
    [-45, -30, 30, 45],
    [-45, -30, 0, 30, 45],
    [-45, -30, 0, 30, 45],
  ],
};

export function getShotAnglesForLevel(weaponTypeId: WeaponTypeId, level: number): number[] {
  const patterns = SHOT_ANGLES_DEG_BY_WEAPON_LEVEL[String(weaponTypeId)];
  if (!patterns) return [0];
  const index = Math.max(0, Math.min(patterns.length - 1, Math.floor(Number(level) || 1) - 1));
  return [...patterns[index]];
}

export function getShotDirections(baseDir: Vec2, weaponTypeId: WeaponTypeId, level: number): Vec2[] {
  const dir = safeUnitDir(baseDir);
  return getShotAnglesForLevel(weaponTypeId, level).map((deg) => {
    const rad = deg * Math.PI / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return safeUnitDir({ x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c });
  });
}

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

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function makeSlot(slot: WeaponSlotId, weaponId: WeaponTypeId): WeaponInstance {
  return {
    slot,
    weaponId,
    level: 1,
    cooldownRemainingSec: 0,
    active: false,
  };
}

function cooldownTotal(spec: EffectiveWeaponSpec): number {
  return Math.max(0, Number(spec.cooldownSec ?? 0));
}

export class WeaponSystem {
  private st: WeaponSystemState = { cdBomb: 0 };

  private readonly slots = {
    w1: makeSlot("w1", ACTIVE_W1_WEAPON_ID),
    w2: makeSlot("w2", ACTIVE_W2_WEAPON_ID),
  };

  private readonly beam: BeamRuntime = { activeDurationRemainingSec: 0, activeDurationTotalSec: 0 };

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
  ) {
    this.slots.w1.weaponId = String(cfg.primary || ACTIVE_W1_WEAPON_ID);
    this.slots.w2.weaponId = String(cfg.secondary || ACTIVE_W2_WEAPON_ID);
  }

  public getSnapshot(): WeaponRuntimeSnapshot {
    return {
      slots: {
        w1: this.slotSnapshot(this.slots.w1),
        w2: this.slotSnapshot(this.slots.w2),
      },
    };
  }

  public getLevel(slot: WeaponSlotId): number {
    return this.slots[slot].level;
  }

  public getMaxLevel(slot: WeaponSlotId): number {
    return getWeaponMaxLevel(this.slots[slot].weaponId, this.db);
  }

  public setLevel(slot: WeaponSlotId, level: number): void {
    if (!Number.isFinite(level)) return;
    this.slots[slot].level = normalizeWeaponLevel(level, this.getMaxLevel(slot));
  }

  public upgradeSlot(slot: WeaponSlotId): void {
    this.setLevel(slot, this.getLevel(slot) + 1);
  }

  public setWeaponForSlot(slot: WeaponSlotId, weaponId: WeaponTypeId): void {
    const def = this.db[weaponId];
    if (!def) throw new Error(`[WeaponSystem] Unknown weaponId: ${String(weaponId)}`);
    if (def.slot && def.slot !== slot) throw new Error(`[WeaponSystem] Weapon ${String(weaponId)} does not belong to slot ${slot}`);
    const previousLevel = this.slots[slot].level;
    this.slots[slot].weaponId = String(weaponId);
    this.slots[slot].level = normalizeWeaponLevel(previousLevel, this.getMaxLevel(slot));
    this.slots[slot].cooldownRemainingSec = 0;
    if (slot === "w2") {
      this.slots.w2.active = false;
      this.beam.activeDurationRemainingSec = 0;
      this.beam.activeDurationTotalSec = 0;
      this.opts?.onLaserEnd?.();
    }
  }

  public toggleW1Weapon(): WeaponTypeId {
    const next = this.slots.w1.weaponId === W1_SPREAD_WEAPON_ID ? ACTIVE_W1_WEAPON_ID : W1_SPREAD_WEAPON_ID;
    this.setWeaponForSlot("w1", next);
    return next;
  }

  /** Compatibility bridge for the existing DOM HUD. */
  public getW2State(): { active: boolean; charge01: number } {
    const snap = this.getSnapshot().slots.w2;
    return { active: snap.active, charge01: snap.charge01 };
  }

  private slotSnapshot(slot: WeaponInstance): WeaponSlotSnapshot {
    const spec = resolveEffectiveWeaponSpec(slot, this.db);
    const total = cooldownTotal(spec);
    const remaining = Math.max(0, Number(slot.cooldownRemainingSec ?? 0));
    const beamDuration = Math.max(0.001, Number(slot.active ? this.beam.activeDurationTotalSec : spec.beam?.durationSec ?? 0));
    const charge01 = slot.active && spec.fireKind === "beam"
      ? clamp01(this.beam.activeDurationRemainingSec / beamDuration)
      : total > 0
        ? clamp01(1 - remaining / total)
        : 1;

    return {
      slot: slot.slot,
      weaponId: slot.weaponId,
      level: spec.level,
      maxLevel: spec.maxLevel,
      fireKind: spec.fireKind,
      active: slot.active,
      cooldownRemainingSec: remaining,
      cooldownTotalSec: total,
      charge01,
      ready01: total > 0 ? clamp01(1 - remaining / total) : 1,
      damage: spec.projectile?.damage ?? spec.beam?.damage,
      projectileCount: spec.fireKind === "projectile" ? spec.projectileCount : undefined,
      durationSec: spec.fireKind === "beam" && slot.active ? beamDuration : spec.beam?.durationSec,
      hitIntervalSec: spec.beam?.hitIntervalSec,
      displayName: spec.name,
    };
  }

  private emitProjectileEvent(
    weaponTypeId: WeaponTypeId,
    owner: EntityRef,
    origin: Vec2,
    dir: Vec2,
    weaponLevel?: number,
  ): void {
    this.bus.emitNext(EventType.SPAWN_PROJECTILE, {
      owner,
      origin: { x: origin.x, y: origin.y },
      dir: { x: dir.x, y: dir.y },
      weaponTypeId: String(weaponTypeId),
      weaponLevel,
    });
  }

  private emitShotFeedback(origin: Vec2, dir: Vec2): void {
    // Existing W1 audio/VFX callback path; createGame currently wires noteFire()
    // here and leaves tracer output muted. Multi-shot levels still call it once
    // per trigger pull so stacked bolts do not stack identical fire audio.
    this.opts?.onSpawnProjectile?.({ x: origin.x, y: origin.y, dx: dir.x, dy: dir.y });
    this.opts?.onTracer?.({ x: origin.x, y: origin.y, dx: dir.x, dy: dir.y });
  }

  private emitProjectileVolley(
    spec: EffectiveWeaponSpec,
    owner: EntityRef,
    shipPos: Vec2,
    dirIn: Vec2,
    shipVel: Vec2 | undefined,
    dtSec: number,
  ): void {
    void shipVel;
    void dtSec;
    const dir = safeUnitDir(dirIn);

    // spawn point: před přídí (tweak)
    const MUZZLE = 12; // px dopředu od středu ship
    const baseOrigin = { x: shipPos.x + dir.x * MUZZLE, y: shipPos.y + dir.y * MUZZLE };
    const projectileCount = Math.max(1, Math.floor(Number(spec.projectileCount ?? 1)));

    const shotDirections = getShotDirections(dir, spec.id, spec.level);
    if (shotDirections.length > 1 || getShotAnglesForLevel(spec.id, spec.level)[0] !== 0) {
      for (const shotDir of shotDirections) {
        this.emitProjectileEvent(spec.id, owner, baseOrigin, shotDir, spec.level);
      }
    } else {
      // Deterministic top-to-bottom vertical stack. Offsets are applied to origin
      // only; every bolt keeps the same forward direction and velocity.
      for (let i = 0; i < projectileCount; i++) {
        const offsetY = (i - (projectileCount - 1) / 2) * W1_SHOT_SPACING_PX;
        this.emitProjectileEvent(spec.id, owner, { x: baseOrigin.x, y: baseOrigin.y + offsetY }, dir, spec.level);
      }
    }

    this.emitShotFeedback(baseOrigin, dir);
  }

  update(dtSec: number, actions: PlayerActions, snap: WeaponSnapshot): void {
    // cooldown decay
    this.slots.w1.cooldownRemainingSec = Math.max(0, this.slots.w1.cooldownRemainingSec - dtSec);
    this.st.cdBomb = Math.max(0, this.st.cdBomb - dtSec);

    const dir = { x: 1, y: 0 }; // default forward fire (no mouse aim)

    const primarySpec = actions.firePrimary ? resolveEffectiveWeaponSpec(this.slots.w1, this.db) : null;
    const secondarySpec = (actions.fireSecondary || this.slots.w2.active || this.slots.w2.cooldownRemainingSec > 0)
      ? resolveEffectiveWeaponSpec(this.slots.w2, this.db)
      : null;
    const bomb = this.db[this.cfg.bomb];

    this.slots.w1.cooldownRemainingSec = tryFire(
      !!actions.firePrimary && (primarySpec?.fireKind ?? "projectile") === "projectile",
      this.slots.w1.cooldownRemainingSec,
      Number(primarySpec?.cooldownSec ?? 0.12),
      () => primarySpec && this.emitProjectileVolley(primarySpec, snap.shipRef, snap.shipPos, dir, snap.shipVel, dtSec),
    );

    // W2 LASER — hold mechanic, now driven by the active beam definition.
    const beam = secondarySpec?.beam;
    const laserDuration = Math.max(0.001, Number(beam?.durationSec ?? 5.0));
    const laserCooldown = Math.max(0, Number(secondarySpec?.cooldownSec ?? 10.0));

    if (this.slots.w2.cooldownRemainingSec > 0) {
      this.slots.w2.cooldownRemainingSec = Math.max(0, this.slots.w2.cooldownRemainingSec - dtSec);
    } else if (this.slots.w2.active) {
      // RMB release → okamžité ukončení
      if (!actions.fireSecondary) {
        this.slots.w2.active = false;
        this.slots.w2.cooldownRemainingSec = laserCooldown;
        this.opts?.onLaserEnd?.();
      } else {
        this.beam.activeDurationRemainingSec -= dtSec;
        if (this.beam.activeDurationRemainingSec <= 0) {
          this.slots.w2.active = false;
          this.slots.w2.cooldownRemainingSec = laserCooldown;
          this.opts?.onLaserEnd?.();
        }
      }
    } else if (actions.fireSecondary && this.slots.w2.cooldownRemainingSec <= 0 && (secondarySpec?.fireKind ?? "beam") === "beam") {
      this.slots.w2.active = true;
      this.beam.activeDurationRemainingSec = laserDuration;
      this.beam.activeDurationTotalSec = laserDuration;
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
