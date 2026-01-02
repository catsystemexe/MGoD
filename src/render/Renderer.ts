import { Vec2 } from "../utils/math";
import { CAWorld } from "../ca/CAWorld";
import { Config, LOGIC_WIDTH, LOGIC_HEIGHT } from "../core/Config";
import { snapCamera, snapPixel } from "../utils/math";
import { PALETTE, SHIP_IDLE, SHIP_LEFT, SHIP_RIGHT, FLAME_FRAMES, EXPLOSION_FRAMES } from "./Sprites";

type PresentInfo = { scale: number; ox: number; oy: number; dw: number; dh: number };

export class Renderer {
  // DISPLAY (DOM canvas)
  private dctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;

  // LOW (truth space)
  private lowCanvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // last present info (for input mapping)
  private presentInfo: PresentInfo = { scale: 1, ox: 0, oy: 0, dw: LOGIC_WIDTH, dh: LOGIC_HEIGHT };

  // NEW: cover vs contain
  private coverMode = false;

  constructor(private canvas: HTMLCanvasElement) {
    const d = this.canvas.getContext("2d", { alpha: false });
    if (!d) throw new Error("Renderer: display canvas 2D context is null");

    this.dctx = d;
    this.dctx.imageSmoothingEnabled = false;

    this.lowCanvas = document.createElement("canvas");
    this.lowCanvas.width = LOGIC_WIDTH;
    this.lowCanvas.height = LOGIC_HEIGHT;

    const c = this.lowCanvas.getContext("2d", { alpha: false });
    if (!c) throw new Error("Renderer: lowCanvas 2D context is null");

    this.ctx = c;
    this.ctx.imageSmoothingEnabled = false;

     }

  setCoverMode(on: boolean) {
    this.coverMode = !!on;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr;
    this.cssW = Math.floor(cssW);
    this.cssH = Math.floor(cssH);

    // CSS size
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;

    // backing store
    this.canvas.width = Math.floor(this.cssW * this.dpr);
    this.canvas.height = Math.floor(this.cssH * this.dpr);

    // draw in CSS px
    this.dctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.dctx.imageSmoothingEnabled = false;
  }

  getContext() {
    return this.ctx;
  }

  getDebug() {
    return {
      // backward compatible
      w: LOGIC_WIDTH,
      h: LOGIC_HEIGHT,
      // explicit
      logicW: LOGIC_WIDTH,
      logicH: LOGIC_HEIGHT,
      cssW: this.cssW,
      cssH: this.cssH,
      dpr: this.dpr,
      present: this.presentInfo,
      cover: this.coverMode,
    };
  }

  screenToLogic(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const xCss = clientX - rect.left;
    const yCss = clientY - rect.top;

    const { ox, oy, scale } = this.presentInfo;
    const lx = Math.floor((xCss - ox) / scale);
    const ly = Math.floor((yCss - oy) / scale);

    if (lx < 0 || ly < 0 || lx >= LOGIC_WIDTH || ly >= LOGIC_HEIGHT) return null;
    return { x: lx, y: ly };
  }

  clear() {
    this.ctx.fillStyle = "#030305";
    this.ctx.fillRect(0, 0, LOGIC_WIDTH, LOGIC_HEIGHT);

    // subtle grid
    this.ctx.strokeStyle = "rgba(0, 150, 255, 0.04)";
    this.ctx.lineWidth = 1;
    const step = 64;
    for (let x = 0; x < LOGIC_WIDTH; x += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, LOGIC_HEIGHT);
      this.ctx.stroke();
    }
    for (let y = 0; y < LOGIC_HEIGHT; y += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(LOGIC_WIDTH, y);
      this.ctx.stroke();
    }
  }

  present(mode: "contain" | "cover" | "coverX" = "contain") {
    const sw = this.cssW;
    const sh = this.cssH;

    const sx = sw / LOGIC_WIDTH;
    const sy = sh / LOGIC_HEIGHT;

    let scaleF: number;
    if (mode === "contain") scaleF = Math.min(sx, sy);
    else if (mode === "cover") scaleF = Math.max(sx, sy);
    else scaleF = sx; // coverX = řiď se jen šířkou

    // integer scaling
    const scale = Math.max(1, (mode === "contain") ? Math.floor(scaleF) : Math.ceil(scaleF));

    const dw = LOGIC_WIDTH * scale;
    const dh = LOGIC_HEIGHT * scale;

    const ox = Math.floor((sw - dw) / 2);
    const oy = Math.floor((sh - dh) / 2);

    this.presentInfo = { scale, ox, oy, dw, dh };

    this.dctx.fillStyle = "black";
    this.dctx.fillRect(0, 0, sw, sh);

    this.dctx.imageSmoothingEnabled = false;
    this.dctx.drawImage(this.lowCanvas, 0, 0, LOGIC_WIDTH, LOGIC_HEIGHT, ox, oy, dw, dh);
  

  // DEBUG: must be visible on #game
  this.dctx.save();
  this.dctx.setTransform(1, 0, 0, 1, 0, 0);
  this.dctx.strokeStyle = "#ff00ff";
  this.dctx.lineWidth = 6;
  this.dctx.strokeRect(0, 0, this.cssW, this.cssH);
  this.dctx.restore();

    }
  drawCA(ca: CAWorld, camWorld: Vec2) {
    const cs = Config.CELL_SIZE;

    const camX = snapCamera(camWorld.x);
    const camY = snapCamera(camWorld.y);

    const offX = camX - LOGIC_WIDTH / 2;
    const offY = camY - LOGIC_HEIGHT / 2;

    const startX = Math.floor(offX / cs);
    const startY = Math.floor(offY / cs);
    const endX = startX + Math.ceil(LOGIC_WIDTH / cs) + 1;
    const endY = startY + Math.ceil(LOGIC_HEIGHT / cs) + 1;

    this.ctx.fillStyle = "#90EE90";

    for (let y = startY; y < endY; y++) {
      if (y < 0 || y >= ca.getHeight()) continue;
      for (let x = startX; x < endX; x++) {
        if (x < 0 || x >= ca.getWidth()) continue;
        if (ca.isAlive(x, y)) {
          const screenX = snapPixel(x * cs - offX);
          const screenY = snapPixel(y * cs - offY);
          this.ctx.fillRect(screenX, screenY, cs, cs);
        }
      }
    }
  }

  drawBullets(bullets: any[], camWorld: Vec2) {
    const camX = snapCamera(camWorld.x);
    const camY = snapCamera(camWorld.y);
    const offX = camX - LOGIC_WIDTH / 2;
    const offY = camY - LOGIC_HEIGHT / 2;

    for (const b of bullets) {
      const sx = snapPixel(b.pos.x - offX);
      const sy = snapPixel(b.pos.y - offY);

      if (b.type === "bomb") {
        this.ctx.fillStyle = "#FF0000";
        this.ctx.fillRect(sx - 6, sy - 6, 12, 12);
      } else if (b.type === "enemy_bomb") {
        this.ctx.fillStyle = "#FF8800";
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.fillRect(sx - 2, sy - 2, 4, 4);
      }
    }
  }

  private drawPixelSprite(data: number[][], pixelScale: number, offsetX: number, offsetY: number) {
    const rows = data.length;
    const cols = data[0].length;

    const drawX = offsetX - (cols * pixelScale) / 2;
    const drawY = offsetY - (rows * pixelScale) / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const colorCode = data[r][c];
        if (colorCode !== 0) {
          this.ctx.fillStyle = PALETTE[colorCode] || "#FF00FF";
          this.ctx.fillRect(drawX + c * pixelScale, drawY + r * pixelScale, pixelScale, pixelScale);
        }
      }
    }
  }

  drawPlayer(pWorld: Vec2, camWorld: Vec2, facing: number, state: string, explosionTime: number, turnState: number) {
    const camX = snapCamera(camWorld.x);
    const camY = snapCamera(camWorld.y);
    const offX = camX - LOGIC_WIDTH / 2;
    const offY = camY - LOGIC_HEIGHT / 2;

    const x = snapPixel(pWorld.x - offX);
    const y = snapPixel(pWorld.y - offY);

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(facing + Math.PI / 2);

    const pxScale = 3;

    if (state === "EXPLODING") {
      const totalFrames = EXPLOSION_FRAMES.length;
      const frameIndex = Math.min(totalFrames - 1, Math.floor(explosionTime * 8));
      this.drawPixelSprite(EXPLOSION_FRAMES[frameIndex], pxScale, 0, 0);
    } else {
      const flameFrame = Math.floor(Date.now() / 50) % FLAME_FRAMES.length;
      this.drawPixelSprite(FLAME_FRAMES[flameFrame], pxScale, 0, 8 * pxScale);

      let sprite = SHIP_IDLE;
      if (turnState === -1) sprite = SHIP_LEFT;
      if (turnState === 1) sprite = SHIP_RIGHT;

      this.drawPixelSprite(sprite, pxScale, 0, 0);
    }

    this.ctx.restore();
  }

  drawSnake(segments: any[], camWorld: Vec2) {
    const camX = snapCamera(camWorld.x);
    const camY = snapCamera(camWorld.y);
    const offX = camX - LOGIC_WIDTH / 2;
    const offY = camY - LOGIC_HEIGHT / 2;

    this.ctx.beginPath();
    this.ctx.strokeStyle = "#550000";
    this.ctx.lineWidth = 2;

    if (segments.length > 0) {
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        if (i === 0) this.ctx.moveTo(s.pos.x - offX, s.pos.y - offY);
        else this.ctx.lineTo(s.pos.x - offX, s.pos.y - offY);
      }
      this.ctx.stroke();
    }

    for (const s of segments) {
      this.ctx.fillStyle = "#AA0000";
      this.ctx.beginPath();
      this.ctx.arc(s.pos.x - offX, s.pos.y - offY, 5, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.fillStyle = "#FF0000";
      this.ctx.fillRect(s.pos.x - offX - 1, s.pos.y - offY - 1, 2, 2);
    }
  }

  drawAim(aimWorld: Vec2, camWorld: Vec2) {
    const camX = snapCamera(camWorld.x);
    const camY = snapCamera(camWorld.y);
    const offX = camX - LOGIC_WIDTH / 2;
    const offY = camY - LOGIC_HEIGHT / 2;

    const x = snapPixel(aimWorld.x - offX);
    const y = snapPixel(aimWorld.y - offY);

    this.ctx.strokeStyle = "rgba(255,255,255,0.4)";
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x - 5, y - 5, 10, 10);
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - 2);
    this.ctx.lineTo(x, y + 2);
    this.ctx.moveTo(x - 2, y);
    this.ctx.lineTo(x + 2, y);
    this.ctx.stroke();
  }

  drawDamageVignette(alpha: number) {
    if (alpha <= 0) return;
    this.ctx.fillStyle = `rgba(255, 0, 0, ${alpha * 0.15})`;
    this.ctx.fillRect(0, 0, LOGIC_WIDTH, LOGIC_HEIGHT);
  }

  drawGameOver(score: number) {
    this.ctx.fillStyle = "rgba(0,0,0,0.85)";
    this.ctx.fillRect(0, 0, LOGIC_WIDTH, LOGIC_HEIGHT);

    this.ctx.textAlign = "center";

    this.ctx.fillStyle = "#FF0055";
    this.ctx.font = "bold 28px monospace";
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = "#FF0055";
    this.ctx.fillText("SYSTEM FAILURE", LOGIC_WIDTH / 2, LOGIC_HEIGHT / 2 - 10);
    this.ctx.shadowBlur = 0;

    this.ctx.fillStyle = "#FFFFFF";
    this.ctx.font = "14px monospace";
    this.ctx.fillText(`FINAL DATA: ${score}`, LOGIC_WIDTH / 2, LOGIC_HEIGHT / 2 + 16);

    this.ctx.fillStyle = "#00FFFF";
    this.ctx.font = "10px monospace";
    this.ctx.fillText("PRESS 'Y' TO REBOOT", LOGIC_WIDTH / 2, LOGIC_HEIGHT / 2 + 40);
  }
}
