import { Config } from "../core/Config";
import { CAWorld } from "../ca/CAWorld";
import { Vec2 } from "../utils/math";

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // logical (CSS) size and dpr
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;

  // backing store size
  private pxW = 0;
  private pxH = 0;

  // resize debugging
  private resizes = 0;
  private lastW = 0;
  private lastH = 0;

  // camera scaling
  private cellSize = 4;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context not available");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    this.resizeToClient();
    window.addEventListener("resize", () => this.resizeToClient());
  }

  setCellSize(px: number): void {
    this.cellSize = px;
  }

  getCellSize(): number {
    return this.cellSize;
  }


  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  getDebug(): { w: number; h: number; dpr: number; resizes: number; lastW: number; lastH: number } {
    return { w: this.cssW, h: this.cssH, dpr: this.dpr, resizes: this.resizes, lastW: this.lastW, lastH: this.lastH };
  }

  private resizeToClient(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

    if (w === this.cssW && h === this.cssH && dpr === this.dpr) return;

    this.lastW = this.cssW;
    this.lastH = this.cssH;

    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;

    this.pxW = Math.floor(w * dpr);
    this.pxH = Math.floor(h * dpr);

    this.canvas.width = this.pxW;
    this.canvas.height = this.pxH;

    // reset transform so drawing in CSS pixels is easy
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;

    this.resizes++;
  }

  clear(): void {
    this.resizeToClient();
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  private worldToScreen(pos: Vec2, cam: Vec2): Vec2 {
    const halfW = this.cssW / 2;
    const halfH = this.cssH / 2;
    return {
      x: (pos.x - cam.x) * this.cellSize + halfW,
      y: (pos.y - cam.y) * this.cellSize + halfH
    };
  }

  drawBounds(cam: Vec2): void {
    // optional: draw world border if you want; keep empty for now
  }

  drawCA(ca: CAWorld, cam: Vec2): void {
    this.ctx.save();
    this.ctx.fillStyle = "#0f0";

    const halfW = this.cssW / 2;
    const halfH = this.cssH / 2;

    ca.forEachAlive((x, y) => {
      const sx = Math.floor((x - cam.x) * this.cellSize + halfW);
      const sy = Math.floor((y - cam.y) * this.cellSize + halfH);
      // tiny sprites, but stable
      this.ctx.fillRect(sx, sy, this.cellSize, this.cellSize);
    });

    this.ctx.restore();
  }

  drawStableChunks(chunks: { cx: number; cy: number; stableTicks: number }[], cam: Vec2): void {
    if (!Config.ENABLE_PHASE2) return;

    const s = Config.CHUNK_SIZE;
    const halfW = this.cssW / 2;
    const halfH = this.cssH / 2;

    this.ctx.save();
    this.ctx.strokeStyle = "rgba(210,170,70,0.45)";
    this.ctx.lineWidth = 1;

    for (const c of chunks) {
      const x0 = c.cx * s;
      const y0 = c.cy * s;

      const sx = Math.floor((x0 - cam.x) * this.cellSize + halfW);
      const sy = Math.floor((y0 - cam.y) * this.cellSize + halfH);

      const w = s * this.cellSize;
      const h = s * this.cellSize;

      this.ctx.strokeRect(sx, sy, w, h);
    }

    this.ctx.restore();
  }

  drawPickups(pickups: { x: number; y: number }[], cam: Vec2): void {
    if (!Config.ENABLE_PHASE2) return;

    const halfW = this.cssW / 2;
    const halfH = this.cssH / 2;

    this.ctx.save();
    this.ctx.strokeStyle = "rgba(255,230,90,0.95)";
    this.ctx.lineWidth = 2;

    for (const p of pickups) {
      const sx = Math.floor((p.x - cam.x) * this.cellSize + halfW);
      const sy = Math.floor((p.y - cam.y) * this.cellSize + halfH);
      const r = 6;
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, r, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  // NEW: draw snake body as faint white dots
  drawSnake(body: { x: number; y: number }[], cam: Vec2): void {
    if (!Config.ENABLE_PHASE2) return;

    const halfW = this.cssW / 2;
    const halfH = this.cssH / 2;

    this.ctx.save();
    this.ctx.fillStyle = "rgba(255,255,255,0.6)";

    for (const b of body) {
      const sx = Math.floor((b.x - cam.x) * this.cellSize + halfW);
      const sy = Math.floor((b.y - cam.y) * this.cellSize + halfH);
      this.ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }

    this.ctx.restore();
  }

  drawAim(aim: Vec2, cam: Vec2): void {
    const s = this.worldToScreen(aim, cam);

    // pixel-snap kvůli ostrosti (jinak se čáry rozmazávají při subpixel pohybu)
    const x = Math.floor(s.x) + 0.5;
    const y = Math.floor(s.y) + 0.5;

    this.ctx.save();
    this.ctx.strokeStyle = "rgba(255,255,255,0.9)";
    this.ctx.lineWidth = 2;

    this.ctx.beginPath();
    this.ctx.moveTo(x - 7, y);
    this.ctx.lineTo(x + 7, y);
    this.ctx.moveTo(x, y - 7);
    this.ctx.lineTo(x, y + 7);
    this.ctx.stroke();

    this.ctx.restore();
  }
  
  drawPlayer(pos: Vec2, cam: Vec2, facing: number): void {
    const s = this.worldToScreen(pos, cam);

    // pixel-snap
    const x = Math.floor(s.x) + 0.5;
    const y = Math.floor(s.y) + 0.5;

    const L = 14;  // délka ramene
    const W = 10;  // rozevření

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(facing);

    this.ctx.strokeStyle = "#fff";
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = "round";

    // Špička dopředu = +X
    this.ctx.beginPath();
    this.ctx.moveTo(L, 0);
    this.ctx.lineTo(-L, -W);
    this.ctx.moveTo(L, 0);
    this.ctx.lineTo(-L, W);
    this.ctx.stroke();

    this.ctx.restore();
  }
}
