// src/game/render/RenderSystem.ts
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { Vec2 } from "../../engine/math/Vec2";
import type { WorldState } from "../data/WorldState";
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
      private readonly world: WorldState,
    ) {
    this.ctx.imageSmoothingEnabled = false;
  }

  private readKind(e: any): string | null {
    const k = e as HasKind;
    return (k.kind ?? k.type ?? k.tag ?? null) as any;
  }

  private drawDebugBackground(
    ctx: CanvasRenderingContext2D,
    view: ViewportInfo,
    sx: number,
    sy: number,
  ) {
    const { x: ox, y: oy, w, h, scale: s } = view;

    // base fill
    ctx.fillStyle = "#080810";
    ctx.fillRect(ox, oy, w, h);

    // grid
    const grid = 64 * s;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;

    const gx0 = -((sx * s) % grid);
    const gy0 = -((sy * s) % grid);

    for (let x = gx0; x < w; x += grid) {
      ctx.beginPath();
      ctx.moveTo(ox + x, oy);
      ctx.lineTo(ox + x, oy + h);
      ctx.stroke();
    }

    for (let y = gy0; y < h; y += grid) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + y);
      ctx.lineTo(ox + w, oy + y);
      ctx.stroke();
    }

    // stars
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 40; i++) {
      const px = ((i * 97) % w + gx0 * 0.3) % w;
      const py = ((i * 57) % h + gy0 * 0.2) % h;
      ctx.fillRect(ox + px, oy + py, s, s);
    }
  }
  
  render(view: ViewportInfo): void {
    const ctx = this.ctx;

    const ox = view.x | 0;
    const oy = view.y | 0;
    const s = view.scale | 0;

    // clear FULL hud canvas (prevents ghost trails anywhere)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const world = (window as any).__CM?.game?.world;
    const sx = world?.scrollX ?? 0;
    const sy = world?.scrollY ?? 0;

    this.drawDebugBackground(ctx, view, sx, sy);
    
    this.store.debugForEachAlive((_ref, e: any) => {
      if (!e) return;

      const kind = this.readKind(e);
      const pos = (e as HasPos).pos;
      if (!kind || !pos) return;

      const world = (window as any).__CM?.game?.world;
      const sx = world?.scrollX ?? 0;
      const sy = world?.scrollY ?? 0;

      const drawY = (kind === "player") ? pos.y : (pos.y - sy);

      const x = (ox + pos.x * s) | 0;
      const y = (oy + drawY * s) | 0;

      if (kind === "player") {
        ctx.fillStyle = "white";
        ctx.fillRect(x - 3 * s, y - 3 * s, 6 * s, 6 * s);
        return;
      }

      if (kind === "enemy") {
        const r = ((e.radius ?? 3) * s) | 0;
        ctx.fillStyle = e.render?.color ?? "#f00";
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
    // --- DEBUG TEXT (top-left)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "12px monospace";

    let enemies = 0;
    let sample: any = null;

    this.store.debugForEachAlive((_ref, e: any) => {
      if (e?.kind === "enemy") {
        enemies++;
        if (!sample) sample = e;
      }
    });

    ctx.fillText(`ENEMIES: ${enemies}`, 8, 16);
    if (sample) {
      const by = String(sample.behaviorId ?? "?");
      const y = (sample.pos?.y ?? NaN).toFixed?.(2) ?? "NaN";
      const vy = (sample.vel?.y ?? NaN).toFixed?.(2) ?? "NaN";
      ctx.fillText(`SAMPLE: b=${by} y=${y} vy=${vy}`, 8, 32);
    
    }
   }
  }