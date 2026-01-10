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

  // optional but used for contact-gating
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

// ✅ WorldEntity musí splnit BaseEntity kontrakt store
export type WorldEntity = BaseEntity & (PlayerEntity | EnemyEntity | ProjectileEntity | BombEntity);

export interface CollisionConfig {
  enemyPriorityOverCA: boolean; // default true (MVP zatím CA ignore)
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export class CollisionSystem {
  constructor(
    private bus: EventBus<CMEventMap>,
    private store: EntityStore<WorldEntity>,
    private cfg: CollisionConfig = { enemyPriorityOverCA: true },
  ) {}

  /** Phase.Collision only: detect collisions and emit events. */
  update(): void {
    // NOTE: cfg zatím nepoužíváme (CA collision není implementované) -> TS warning je ok.
    // Pokud chceš warning zabít: void this.cfg;

    const enemies: Array<{ ref: EntityRef; e: EnemyEntity }> = [];

    let playerRef: EntityRef | null = null;
    let player: PlayerEntity | null = null;

    // 1) snapshot enemies + find player
    this.store.debugForEachAlive((ref, e) => {
      if (e.pendingKill) return;

      if (e.kind === "enemy") enemies.push({ ref, e: e as EnemyEntity });

      if (e.kind === "player") {
        playerRef = ref;
        player = e as PlayerEntity;
      }
    });

    // 2) projectile -> enemy
    this.store.debugForEachAlive((projRef, e) => {
      if (e.pendingKill) return;
      if (e.kind !== "projectile") return;
      if (e.consumed) return;

      const pr = e.radius;

      for (const { ref: enemyRef, e: enemy } of enemies) {
        const rr = pr + enemy.radius;
        if (dist2(e.pos.x, e.pos.y, enemy.pos.x, enemy.pos.y) <= rr * rr) {
          // emit hit (owned by Impact)
          this.bus.emit(EventType.PROJECTILE_HIT_ENEMY, { projectile: projRef, enemy: enemyRef });

          // one-hit rule
          e.consumed = true;
          break;
        }
      }
    });

    // 3) player -> enemy (CONTACT)
    if (!player || !playerRef) return;

    // gate by invulnerability (seconds)
    const inv = Number(player.invulnT ?? 0);
    if (Number.isFinite(inv) && inv > 0) return;

    const px = player.pos.x, py = player.pos.y;
    const pr = Number(player.radius ?? 3);

    for (const { ref: enemyRef, e: enemy } of enemies) {
      const rr = pr + Number(enemy.radius ?? 4);
      if (dist2(px, py, enemy.pos.x, enemy.pos.y) <= rr * rr) {
        // emit contact (owned by Impact)
        this.bus.emit(EventType.PLAYER_HIT_ENEMY, { player: playerRef, enemy: enemyRef } as any);
        break; // one contact per tick (MVP)
      }
    }
  }
}