// src/game/render/RenderSystem.ts
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { Vec2 } from "../../engine/math/Vec2";

type HasPos = { pos: Vec2 };
type HasKind = { kind: string };

function clear(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
}

export class RenderSystem {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly store: EntityStore<any>,
    private readonly logicW: number,
    private readonly logicH: number,
    private readonly scale: number = 2,
  ) {
    // pixel art default
    this.ctx.imageSmoothingEnabled = false;
  }

  render(): void {
    const ctx = this.ctx;
    const W = this.logicW * this.scale;
    const H = this.logicH * this.scale;

    clear(ctx, W, H);

    // background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // Draw all alive entities
    this.store.debugForEachAlive((_ref, e: any) => {
      if (!e) return;
      const kind = (e as HasKind).kind;
      const pos = (e as HasPos).pos;
      if (!kind || !pos) return;

      const x = pos.x * this.scale;
      const y = pos.y * this.scale;

      if (kind === "enemy") {
        const r = ((e.radius ?? 3) * this.scale) | 0;
        ctx.fillStyle = "#f00";
        ctx.fillRect((x - r) | 0, (y - r) | 0, (2 * r) | 0, (2 * r) | 0);
        return;
      }

      if (kind === "projectile") {
        ctx.fillStyle = "#0f0";
        // malá “čárka”
        ctx.fillRect((x | 0), (y | 0), 2 * this.scale, 1 * this.scale);
        return;
      }

      if (kind === "bomb") {
        const r = ((e.radius ?? 6) * this.scale) | 0;
        ctx.fillStyle = "#ff0";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
    });

    // debug border of logic rect
    ctx.strokeStyle = "#222";
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }
}
