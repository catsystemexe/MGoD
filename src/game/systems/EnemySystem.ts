// src/game/systems/EnemySystem.ts
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { TickContext } from "../../engine/core/Loop";
import { EnemyBehaviorDB } from "../enemies/EnemyBehaviorDB";

const isBadNum = (n: any) => typeof n !== "number" || !Number.isFinite(n);
const DEV = (globalThis as any).__DEV__ ?? false;

export class EnemySystem {
  constructor(
    private readonly store: EntityStore<any>,
    private readonly logicW: number,
    private readonly logicH: number,
  ) {}

  update(ctx: TickContext): void {
    const dt = ctx.dt;
    const H = this.logicH;

    this.store.debugForEachAlive((ref, e: any) => {
      if (!e || e.kind !== "enemy") return;
      if (e.pendingKill) return;

      // mandatory components
      if (!e.pos) {
        console.error("[EnemySystem] enemy without pos", e);
        this.store.markKill(ref);
        return;
      }
      if (!e.vel) e.vel = { x: 0, y: 0 };
      if (!e.bState) e.bState = { t: 0 };

      const behavior = EnemyBehaviorDB[e.behaviorId] ?? EnemyBehaviorDB["none"];

      try {
        behavior?.update?.(e, ctx);
      } catch (err) {
        console.error("[EnemyBehavior crash]", e.behaviorId, err, e);
        this.store.markKill(ref);
        return;
      }

      // sanitize numbers AFTER behavior
      if (
        isBadNum(e.pos.x) || isBadNum(e.pos.y) ||
        isBadNum(e.vel.x) || isBadNum(e.vel.y)
      ) {
        if (DEV) console.error("[EnemyBehavior] NaN/Inf pos/vel", e.behaviorId, e);
        this.store.markKill(ref);
        return;
      }

      // integrate movement here (single authority)
      e.pos.x += e.vel.x * dt;
      e.pos.y += e.vel.y * dt;

      // global offscreen cull
      const r = (typeof e.radius === "number" && Number.isFinite(e.radius)) ? e.radius : 4;
      if (e.pos.y > H + r + 8) this.store.markKill(ref);
    });
  }
}