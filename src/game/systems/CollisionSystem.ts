import type { EventBus } from "../../engine/core/EventBus";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { BaseEntity } from "../../engine/ecs/ComponentTypes";

// --- World entities (MVP subset used by Collision) ---

export interface PlayerEntity {
  kind: "player";
  pos: { x: number; y: number };
  radius: number;
  pendingKill: boolean;

  invulnT?: number; // seconds
  energy?: number;
  energyMax?: number;
}

export interface EnemyEntity {
  kind: "enemy";
  pos: { x: number; y: number };
  radius: number;
  hp: number;
  pendingKill: boolean;
}

export interface ProjectileEntity {
  kind: "projectile";
  owner: EntityRef;
  weapon: "primary" | "secondary";
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
  pos: { x: number; y: number };
  vel?: { x: number; y: number };
  radius: number;
  ttl?: number;
  pendingKill: boolean;
}

// WorldEntity must satisfy BaseEntity contract used by the store
export type WorldEntity = BaseEntity & (PlayerEntity | EnemyEntity | ProjectileEntity | BombEntity | PickupEntity);

export interface CollisionConfig {
  enemyPriorityOverCA: boolean; // MVP: CA collision not implemented
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export class CollisionSystem {
  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly store: EntityStore<WorldEntity>,
    private readonly cfg: CollisionConfig = { enemyPriorityOverCA: true },
  ) {}

  /** Phase.Collision only: detect collisions and emit events. */
  update(): void {
    // silence unused cfg warning (CA collision later)
    void this.cfg;

    const enemies: Array<{ ref: EntityRef; e: EnemyEntity }> = [];
    const pickups: Array<{ ref: EntityRef; e: PickupEntity }> = [];

    let playerRef: EntityRef | null = null;
    let player: (WorldEntity & PlayerEntity) | null = null;

    // 1) snapshot enemies/pickups + find player
    this.store.debugForEachAlive((ref, e) => {
      if (!e || e.pendingKill) return;

      if (e.kind === "enemy") enemies.push({ ref, e: e as EnemyEntity });
      else if (e.kind === "pickup") pickups.push({ ref, e: e as PickupEntity });
      else if (e.kind === "player") {
        playerRef = ref;
        player = e as (WorldEntity & PlayerEntity);
      }
    });

    // 2) projectile -> enemy
    this.store.debugForEachAlive((projRef, e) => {
      if (!e || e.pendingKill) return;
      if (e.kind !== "projectile") return;
      if ((e as any).consumed) return;

      const proj = e as ProjectileEntity;
      const pr = Number(proj.radius ?? 0);

      for (const { ref: enemyRef, e: enemy } of enemies) {
        const rr = pr + Number(enemy.radius ?? 0);
        if (dist2(proj.pos.x, proj.pos.y, enemy.pos.x, enemy.pos.y) <= rr * rr) {
          this.bus.emit(EventType.PROJECTILE_HIT_ENEMY, { projectile: projRef, enemy: enemyRef });
          (proj as any).consumed = true; // one-hit
          break;
        }
      }
    });

    // 2.5) player -> pickup
    if (playerRef && player && player.kind === "player") {
      const px = player.pos.x, py = player.pos.y;
      const pr = Number(player.radius ?? 3);

      for (const { ref: pickRef, e: pick } of pickups) {
        if (pick.pendingKill) continue;

        const rr = pr + Number(pick.radius ?? 4);
        if (dist2(px, py, pick.pos.x, pick.pos.y) <= rr * rr) {
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

    // 3) player -> enemy (CONTACT)
    if (!playerRef || !player || player.kind !== "player") return;

    const inv = Number(player.invulnT ?? 0);
    if (Number.isFinite(inv) && inv > 0) return;

    const px = player.pos.x, py = player.pos.y;
    const pr = Number(player.radius ?? 3);

    for (const { ref: enemyRef, e: enemy } of enemies) {
      const rr = pr + Number(enemy.radius ?? 4);
      if (dist2(px, py, enemy.pos.x, enemy.pos.y) <= rr * rr) {
        this.bus.emit(EventType.PLAYER_HIT_ENEMY, { player: playerRef, enemy: enemyRef } as any);
        break;
      }
    }
  }
}
