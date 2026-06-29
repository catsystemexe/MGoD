import type { EventBus } from "../../engine/core/EventBus";
import { EventType, type CMEventMap } from "../../engine/core/events";
import { WEAPON_DB } from "../defs/WeaponDB";
import { ACTIVE_W2_WEAPON_ID, resolveWeaponDefinition } from "../defs/Weapons";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { BaseEntity } from "../../engine/ecs/ComponentTypes";
import type { EnemyDeathGhostSnapshot } from "../fx/EnemyDeathVisual";

// --- World entities (MVP subset used by Collision) ---

export interface PlayerEntity {
  kind: "player";
  // NOTE: player.pos is in WORLD space (unified contract — same as all entities)
  pos: { x: number; y: number };
  radius: number;
  bodyRadius?: number;
  pendingKill: boolean;

  invulnT?: number; // seconds
  energy?: number;
  energyMax?: number;
}

export interface EnemyEntity {
  kind: "enemy";
  // enemy.pos is in WORLD space
  pos: { x: number; y: number };
  radius: number;
  hp: number;
  pendingKill: boolean;
}

export interface ProjectileEntity {
  kind: "projectile";
  owner: EntityRef;
  weapon: "primary" | "secondary";
  // projectile.pos is in WORLD space
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  ttl: number;
  damage: number;
  radius: number;
  pendingKill: boolean;
  consumed: boolean;
}

export interface BombEntity {
  kind: "bomb";
  owner: EntityRef;
  // bomb.pos is in WORLD space
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  ttl: number;
  damage: number;
  radius: number;
  pendingKill: boolean;
  target: { x: number; y: number };
}

export interface PickupEntity {
  kind: "pickup";
  defId: string;
  // pickup.pos is in WORLD space
  pos: { x: number; y: number };
  vel?: { x: number; y: number };
  radius: number;
  ttl?: number;
  pendingKill: boolean;
}

export interface EnemyProjectileEntity {
  kind: "enemyProjectile";
  pos: { x: number; y: number };
  radius: number;
  damage: number;
  pendingKill: boolean;
  consumed: boolean;
}

export interface FxEntity {
  kind: "fx";
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  ttl: number;
  radius: number;
  pendingKill: boolean;
  posPrev?: { x: number; y: number };
  spawnT?: number;
  fxAge?: number;
  explosionScale?: number;
  spriteId?: string;
  animId?: string;
  render?: Record<string, unknown>;
  deathVisual?: {
    age: number;
    flashSec: number;
    burnSec: number;
    overlapSec: number;
    snapshot: EnemyDeathGhostSnapshot;
  };
}

// WorldEntity must satisfy BaseEntity contract used by the store
export type WorldEntity =
  BaseEntity & (PlayerEntity | EnemyEntity | ProjectileEntity | BombEntity | PickupEntity | EnemyProjectileEntity | FxEntity);

export interface CollisionConfig {
  enemyPriorityOverCA: boolean; // MVP: CA collision not implemented
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

function positiveFiniteRadius(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function playerBodyRadius(player: PlayerEntity): number {
  return positiveFiniteRadius((player as any).bodyRadius) ?? positiveFiniteRadius(player.radius) ?? 0;
}

const ACTIVE_W2_BEAM = resolveWeaponDefinition(ACTIVE_W2_WEAPON_ID, WEAPON_DB).beam;
const W2_LASER_DAMAGE = Number(ACTIVE_W2_BEAM?.damage ?? 15);
const W2_LASER_HIT_INTERVAL_SEC = Number(ACTIVE_W2_BEAM?.hitIntervalSec ?? 0.08);

export class CollisionSystem {
  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly store: EntityStore<WorldEntity>,
    // camera / scroll state (world-space Y)
    private readonly world: { scrollY: number } = { scrollY: 0 },
    private readonly cfg: CollisionConfig = { enemyPriorityOverCA: true },
  ) {}

  /** Phase.Collision only: detect collisions and emit events. */
  update(dtSec: number = 0.016): void {
    // silence unused cfg warning (CA collision later)
    void this.cfg;
    // Unified contract: every entity (player, enemy, projectile, pickup) lives in
    // WORLD space, so collisions compare pos.x/pos.y directly — no camera conversion.
    void this.world;

    const enemies: Array<{ ref: EntityRef; e: EnemyEntity }> = [];
    const pickups: Array<{ ref: EntityRef; e: PickupEntity }> = [];

    let playerRef: any = null;
    let player: any = null;

    // 1) snapshot enemies/pickups + find player
    this.store.debugForEachAlive((ref, e: any) => {
      if (!e || e.pendingKill) return;

      if (e.kind === "enemy") enemies.push({ ref, e: e as EnemyEntity });
      else if (e.kind === "pickup") pickups.push({ ref, e: e as PickupEntity });
      else if (e.kind === "player") {
        playerRef = ref;
        player = e;
      }
    });

    // 2) projectile -> enemy (both WORLD space => compare directly)
    this.store.debugForEachAlive((projRef, e: any) => {
      if (!e || e.pendingKill) return;
      if (e.kind !== "projectile") return;
      if ((e as any).consumed) return;

      const proj = e as ProjectileEntity;
      const pr = Number(proj.radius ?? 0);

      const psx = Number(proj.pos?.x ?? 0);
      const psy = Number(proj.pos?.y ?? 0);

      for (const { ref: enemyRef, e: enemy } of enemies) {
        const rr = pr + Number(enemy.radius ?? 0);
        if (dist2(psx, psy, enemy.pos.x, enemy.pos.y) <= rr * rr) {
          this.bus.emit(EventType.PROJECTILE_HIT_ENEMY, { projectile: projRef, enemy: enemyRef });
          (proj as any).consumed = true; // one-hit
          break;
        }
      }
    });

    // 2.25) LASER damage
    const laserEnts: Array<{pos:{x:number,y:number}, damage:number}> = [];
    this.store.debugForEachAlive((_ref, e: any) => {
      if (e.kind === 'laser') laserEnts.push(e);
    });

    if (laserEnts.length > 0) {
      for (const { ref: eRef, e: enemy } of enemies) {
        for (const laser of laserEnts) {
          const dy = Math.abs(enemy.pos.y - laser.pos.y);
          const hitRadius = enemy.radius + 8;
          if (dy < hitRadius && enemy.pos.x > laser.pos.x) {
            if (!(enemy as any).laserHitTimer || (enemy as any).laserHitTimer <= 0) {
              (enemy as any).laserHitTimer = W2_LASER_HIT_INTERVAL_SEC;
              this.bus.emitNext(EventType.PROJECTILE_HIT_ENEMY, {
                projectile: {
                  damage: W2_LASER_DAMAGE,
                  consumed: false,
                  pendingKill: false,
                } as any,
                enemy: eRef,
              });
            }
          }
        }
      }
    }

    // Tick laser hit timers
    this.store.debugForEachAlive((_ref, e: any) => {
      if (e.kind === 'enemy' && (e as any).laserHitTimer > 0) {
        (e as any).laserHitTimer -= dtSec;
      }
    });

    // 2.5) player -> pickup (both WORLD space => compare directly)
    if (playerRef && player && player.kind === "player") {
      const pwx = Number(player.pos?.x ?? 0);
      const pwy = Number(player.pos?.y ?? 0);
      const pr = playerBodyRadius(player as PlayerEntity);

      for (const { ref: pickRef, e: pick } of pickups) {
        if (pick.pendingKill) continue;

        const rr = pr + Number(pick.radius ?? 4);
        if (dist2(pwx, pwy, pick.pos.x, pick.pos.y) <= rr * rr) {
          this.bus.emit(EventType.PLAYER_PICKUP, {
            player: playerRef,
            pickup: pickRef,
            defId: pick.defId,
          });

          // prevent double pickup this tick; cleanup will remove later
          (pick as any).pendingKill = true;
          break;
        }
      }
    }

    // 3) player -> enemy (CONTACT) (both WORLD space => compare directly)
    if (!playerRef || !player || player.kind !== "player") return;

    const inv = Number(player.invulnT ?? 0);
    if (Number.isFinite(inv) && inv > 0) return;

    const pwx = Number(player.pos?.x ?? 0);
    const pwy = Number(player.pos?.y ?? 0);

    const combatPr = Number(player.radius ?? 3);
    const bodyPr = playerBodyRadius(player as PlayerEntity);

    // 3.5) enemyProjectile -> player
    this.store.debugForEachAlive((epRef, ep: any) => {
      if (!ep || ep.pendingKill) return;
      if (ep.kind !== "enemyProjectile") return;
      if (ep.consumed) return;

      const rr = combatPr + Number(ep.radius ?? 4);
      if (dist2(pwx, pwy, Number(ep.pos?.x ?? 0), Number(ep.pos?.y ?? 0)) <= rr * rr) {
        ep.consumed = true;
        this.bus.emit(EventType.ENEMY_PROJECTILE_HIT_PLAYER, {
          projectile: epRef,
          player: playerRef,
          damage: Number(ep.damage ?? 1),
        });
      }
    });

    // 4) player -> enemy (CONTACT)
    for (const { ref: enemyRef, e: enemy } of enemies) {
      const rr = bodyPr + Number(enemy.radius ?? 4);
      if (dist2(pwx, pwy, enemy.pos.x, enemy.pos.y) <= rr * rr) {
        this.bus.emit(EventType.PLAYER_HIT_ENEMY, { player: playerRef, enemy: enemyRef });
        break;
      }
    }
  }
}
