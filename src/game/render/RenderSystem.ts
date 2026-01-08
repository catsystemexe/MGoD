// src/game/render/RenderSystem.ts
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { Vec2 } from "../../engine/math/Vec2";

type HasPos = { pos: Vec2 };
type HasKind = { kind?: string; type?: string; tag?: string };

export type ViewportInfo = {
  x: number; // px (HUD canvas space) - physical px (canvas width/height space)
  y: number; // px
  w: number; // px
  h: number; // px
  scale: number; // integer
};

export class RenderSystem {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly store: EntityStore<any>,
    private readonly logicW: number,
    private readonly logicH: number,
  ) {
    this.ctx.imageSmoothingEnabled = false;
  }

  private readKind(e: any): string | null {
    const k = e as HasKind;
    return (k.kind ?? k.type ?? k.tag ?? null) as any;
  }

  render(view: ViewportInfo): void {
    const ctx = this.ctx;

    const ox = view.x | 0;
    const oy = view.y | 0;
    const s = view.scale | 0;

    // clear FULL hud canvas (prevents ghost trails anywhere)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    this.store.debugForEachAlive((_ref, e: any) => {
      if (!e) return;

      const kind = this.readKind(e);
      const pos = (e as HasPos).pos;
      if (!kind || !pos) return;

      const x = (ox + pos.x * s) | 0;
      const y = (oy + pos.y * s) | 0;

      if (kind === "player") {
        ctx.fillStyle = "white";
        ctx.fillRect(x - 3 * s, y - 3 * s, 6 * s, 6 * s);
        return;
      }

      if (kind === "enemy") {
        const r = ((e.radius ?? 3) * s) | 0;
        ctx.fillStyle = "#f00";
        ctx.fillRect((x - r) | 0, (y - r) | 0, (2 * r) | 0, (2 * r) | 0);
        return;
      }

      if (kind === "projectile") {
        ctx.fillStyle = "#0f0";
        ctx.fillRect(x, y, 2 * s, 1 * s);
        return;
      }

      if (kind === "bomb") {
        const r = ((e.radius ?? 6) * s) | 0;
        ctx.fillStyle = "#ff0";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
    });

    // debug border of viewport rect
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.strokeRect(ox + 0.5, oy + 0.5, view.w - 1, view.h - 1);
  }
}