import type { EventBus } from "../../engine/core/EventBus";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EntityRef } from "../../engine/ecs/EntityRef";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { BaseEntity } from "../../engine/ecs/ComponentTypes";

// --- World entities (MVP subset used by Collision) ---

export interface PlayerEntity {
  kind: "player";
  // NOTE: player.pos is in SCREEN space (logic screen), not world space
  pos: { x: number; y: number };
  radius: number;
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

// WorldEntity must satisfy BaseEntity contract used by the store
export type WorldEntity =
  BaseEntity & (PlayerEntity | EnemyEntity | ProjectileEntity | BombEntity | PickupEntity);

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
    // camera / scroll state (world-space Y)
    private readonly world: { scrollY: number } = { scrollY: 0 },
    private readonly cfg: CollisionConfig = { enemyPriorityOverCA: true },
  ) {}

  /** Phase.Collision only: detect collisions and emit events. */
  update(): void {
    // silence unused cfg warning (CA collision later)
    void this.cfg;

    const camY = Number((this.world as any)?.scrollY ?? 0);
    const camX = Number((this.world as any)?.scrollX ?? 0);

    
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

    // 2) projectile -> enemy (proj.x is SCREEN, enemy.x is WORLD => add camX)
    this.store.debugForEachAlive((projRef, e: any) => {
      if (!e || e.pendingKill) return;
      if (e.kind !== "projectile") return;
      if ((e as any).consumed) return;

      const proj = e as ProjectileEntity;
      const pr = Number(proj.radius ?? 0);

      const psx = Number(proj.pos?.x ?? 0) + camX; // SCREEN -> WORLD
      const psy = Number(proj.pos?.y ?? 0);        // already WORLD (WeaponSystem adds scrollY on spawn)

      for (const { ref: enemyRef, e: enemy } of enemies) {
        const rr = pr + Number(enemy.radius ?? 0);
        if (dist2(psx, psy, enemy.pos.x, enemy.pos.y) <= rr * rr) {
          this.bus.emit(EventType.PROJECTILE_HIT_ENEMY, { projectile: projRef, enemy: enemyRef });
          (proj as any).consumed = true; // one-hit
          break;
        }
      }
    });

    // 2.5) player -> pickup (player SCREEN space -> convert to WORLD space)
    if (playerRef && player && player.kind === "player") {
      const px = Number(player.pos?.x ?? 0);
      const py = Number(player.pos?.y ?? 0);
      const pwy = py + camY;
      const pwx = px + camX;
      const pr = Number(player.radius ?? 3);

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

    // 3) player -> enemy (CONTACT) (player SCREEN space -> convert to WORLD space)
    if (!playerRef || !player || player.kind !== "player") return;

    const inv = Number(player.invulnT ?? 0);
    if (Number.isFinite(inv) && inv > 0) return;

    const px = Number(player.pos?.x ?? 0);
    const py = Number(player.pos?.y ?? 0);

    const pwx = px + camX;
    const pwy = py + camY;

    const pr = Number(player.radius ?? 3);

    for (const { ref: enemyRef, e: enemy } of enemies) {
      const rr = pr + Number(enemy.radius ?? 4);
      if (dist2(pwx, pwy, enemy.pos.x, enemy.pos.y) <= rr * rr) {
        this.bus.emit(EventType.PLAYER_HIT_ENEMY, { player: playerRef, enemy: enemyRef });
        break;
      }
    }
  }
}
