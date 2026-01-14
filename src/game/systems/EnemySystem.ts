// src/game/systems/EnemySystem.ts
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { TickContext } from "../../engine/core/Loop";
import { EnemyBehaviorDB } from "../enemies/EnemyBehaviorDB";
import type { EnemyBehaviorId } from "../enemies/EnemyBehaviorTypes";

const DEV = Boolean((globalThis as any).__DEV__);

const isFiniteNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const safeNum = (n: unknown, fallback = 0) => (isFiniteNum(n) ? n : fallback);

// type guard: string -> EnemyBehaviorId
function isBehaviorId(x: unknown): x is EnemyBehaviorId {
  return typeof x === "string" && x in EnemyBehaviorDB;
}

export class EnemySystem {
  constructor(
    private readonly store: EntityStore<any>,
    private readonly logicW: number,
    private readonly logicH: number,
  ) {}

  update(ctx: TickContext): void {
    const dt = safeNum((ctx as any).dt, 0);
    if (dt <= 0) return;

    const H = this.logicH;

    this.store.debugForEachAlive((ref, e: any) => {
      if (!e || e.kind !== "enemy") return;
      if (e.pendingKill) return;

      // mandatory components
      if (!e.pos) {
        console.error("[EnemySystem] enemy without pos -> kill", e);
        this.store.markKill(ref);
        return;
      }
      if (!e.vel) e.vel = { x: 0, y: 0 };
      if (!e.bState) e.bState = { t: 0 };

      // sanitize BEFORE behavior
      e.pos.x = safeNum(e.pos.x, 0);
      e.pos.y = safeNum(e.pos.y, 0);
      e.vel.x = safeNum(e.vel.x, 0);
      e.vel.y = safeNum(e.vel.y, 0);

      // --- posPrev snapshot for render interpolation (must be BEFORE behavior + movement)
      const a = e as any;
      if (!a.posPrev) a.posPrev = { x: e.pos.x, y: e.pos.y };
      else { a.posPrev.x = e.pos.x; a.posPrev.y = e.pos.y; }
         
          

      // --- HIT FLASH timer (seconds) ---
      // normalize to finite number every tick
      {
        const hf = Number(e.hitFlashT ?? 0);
        if (Number.isFinite(hf) && hf > 0) e.hitFlashT = Math.max(0, hf - dt);
        else e.hitFlashT = 0;
      }

      // behavior id (TS-safe)
      const bid: EnemyBehaviorId = isBehaviorId(e.behaviorId) ? e.behaviorId : "none";
      if (DEV && bid === "none" && e.behaviorId && !isBehaviorId(e.behaviorId)) {
        console.warn("[EnemySystem] unknown behaviorId -> none:", e.behaviorId, "type:", e.typeId);
      }
      e.behaviorId = bid;

      const behavior = EnemyBehaviorDB[bid];

      // run behavior safely
      try {
        // 1) update internal state
        behavior?.update?.(e, ctx);

        // 2) V1: if behavior provides target, derive velocity here (single authority)
        if (behavior?.getTarget) {
          const t = behavior.getTarget(e, ctx);
          if (t && Number.isFinite(t.x) && Number.isFinite(t.y)) {
            const px = safeNum(e.pos?.x, 0);
            const py = safeNum(e.pos?.y, 0);
            e.vel = e.vel || { x: 0, y: 0 };
            e.vel.x = (t.x - px) / dt;
            e.vel.y = (t.y - py) / dt;
          }
        }
      } catch (err) {
        console.error("[EnemyBehavior crash]", bid, err, e);
        this.store.markKill(ref);
        return;
      }

      // sanitize AFTER behavior (repair)
      if (!isFiniteNum(e.pos?.x) || !isFiniteNum(e.pos?.y)) {
        if (DEV) console.error("[EnemyBehavior] invalid pos -> reset", bid, e.pos, e);
        e.pos.x = safeNum(e.pos?.x, 0);
        e.pos.y = safeNum(e.pos?.y, 0);
      }
      if (!isFiniteNum(e.vel?.x) || !isFiniteNum(e.vel?.y)) {
        if (DEV) console.error("[EnemyBehavior] invalid vel -> zero", bid, e.vel, e);
        e.vel.x = 0;
        e.vel.y = 0;
      }

      // FAILSAFE: pokud behavior nic nenastaví a enemy je nad obrazem, tlač ho dolů
      if (e.pos.y < -1 && e.vel.y === 0) {
        e.vel.y = 40;
      }
// integrate movement (single authority)
e.pos.x += e.vel.x * dt;
e.pos.y += e.vel.y * dt;

// offscreen cull
const r = safeNum(e.radius, 4);
if (e.pos.y > H + r + 8) this.store.markKill(ref);
});
}
}