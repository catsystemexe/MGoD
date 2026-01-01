import { Vec2 } from "../utils/math";
import { CAWorld } from "../ca/CAWorld";
import { Config, LOGIC_WIDTH, LOGIC_HEIGHT } from "../core/Config";
import { snapCamera, snapPixel } from "../utils/math";
import { PALETTE, SHIP_IDLE, SHIP_LEFT, SHIP_RIGHT, FLAME_FRAMES, EXPLOSION_FRAMES } from "./Sprites";

type PresentInfo = { scale: number; ox: number; oy: number; dw: number; dh: number; };

export class Renderer {
  // DISPLAY (DOM canvas)
  private dctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;

  // LOW (320x224)
  private lowCanvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // poslední letterbox info (pro input mapping)
  private presentInfo: PresentInfo = { scale: 1, ox: 0, oy: 0, dw: LOGIC_WIDTH, dh: LOGIC_HEIGHT };

  constructor(private canvas: HTMLCanvasElement) {
    this.dctx = canvas.getContext("2d", { alpha: false, desynchronized: true })!;
    this.dctx.imageSmoothingEnabled = false;

    this.lowCanvas = document.createElement("canvas");
    this.lowCanvas.width = LOGIC_WIDTH;
    this.lowCanvas.height = LOGIC_HEIGHT;

    this.ctx = this.lowCanvas.getContext("2d", { alpha: false })!;
    this.ctx.imageSmoothingEnabled = false;

    this.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  }

  /** display resize in CSS pixels + DPR backing store */
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

    // draw in CSS pixels
    this.dctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.dctx.imageSmoothingEnabled = false;
  }

  /** LOW ctx (truth space) */
  getContext() { return this.ctx; }

  /** for debugging */
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
  };
}

  /** map screen (client) -> logic pixel coords; returns null if outside letterbox */
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
  
 
  // ----- FRAME -----
  clear() {
    // low-res clear (truth)
    this.ctx.fillStyle = "#030305";
    this.ctx.fillRect(0, 0, LOGIC_WIDTH, LOGIC_HEIGHT);

    // DEBUG: levý horní pixel v low-res
    this.ctx.fillStyle = "#00FF00";
    this.ctx.fillRect(0, 0, 2, 2);

    
    // Jemná mřížka (POZOR: tohle je “styl”, pro MVP ok, ale je to už “iluze”)
    this.ctx.strokeStyle = "rgba(0, 150, 255, 0.04)";
    this.ctx.lineWidth = 1;
    const step = 64;
    for (let x = 0; x < LOGIC_WIDTH; x += step) {
      this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, LOGIC_HEIGHT); this.ctx.stroke();
    }
    for (let y = 0; y < LOGIC_HEIGHT; y += step) {
      this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(LOGIC_WIDTH, y); this.ctx.stroke();
    }
  }

  /** Present low canvas -> display with integer scaling + letterbox */
  present() {
    const sw = this.cssW;
    const sh = this.cssH;

    const scale = Math.max(1, Math.floor(Math.min(sw / LOGIC_WIDTH, sh / LOGIC_HEIGHT)));
    const dw = LOGIC_WIDTH * scale;
    const dh = LOGIC_HEIGHT * scale;
    const ox = Math.floor((sw - dw) / 2);
    const oy = Math.floor((sh - dh) / 2);

    this.presentInfo = { scale, ox, oy, dw, dh };

    // clear letterbox
    this.dctx.fillStyle = "black";
    this.dctx.fillRect(0, 0, sw, sh);

    // DEBUG: viditelný důkaz, že present() kreslí
    this.dctx.fillStyle = "rgba(255,0,255,0.4)";
    this.dctx.fillRect(0, 0, 40, 40);
    
    // critical: nearest
    this.dctx.imageSmoothingEnabled = false;
    this.dctx.drawImage(this.lowCanvas, 0, 0, LOGIC_WIDTH, LOGIC_HEIGHT, ox, oy, dw, dh);
  }

  // ----- WORLD DRAWS (do LOW ctx) -----

  drawCA(ca: CAWorld, camWorld: Vec2) {
    const cs = Config.CELL_SIZE;

    // snapped camera (jitter fix)
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

  // --- PROCEDURAL SPRITE DRAWING ---
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

    // TODO: pxScale časem navážeme na skutečný sprite systém.
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
        const x = snapPixel(s.pos.x - offX);
        const y = snapPixel(s.pos.y - offY);
        if (i === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }
      this.ctx.stroke();
    }

    for (const s of segments) {
      const x = snapPixel(s.pos.x - offX);
      const y = snapPixel(s.pos.y - offY);

      this.ctx.fillStyle = "#AA0000";
      this.ctx.beginPath();
      this.ctx.arc(x, y, 5, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.fillStyle = "#FF0000";
      this.ctx.fillRect(x - 1, y - 1, 2, 2);
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
    this.ctx.moveTo(x, y - 2); this.ctx.lineTo(x, y + 2);
    this.ctx.moveTo(x - 2, y); this.ctx.lineTo(x + 2, y);
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
    this.ctx.font = "bold 40px monospace";
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = "#FF0055";
    this.ctx.fillText("SYSTEM FAILURE", LOGIC_WIDTH / 2, LOGIC_HEIGHT / 2 - 20);
    this.ctx.shadowBlur = 0;

    this.ctx.fillStyle = "#FFFFFF";
    this.ctx.font = "20px monospace";
    this.ctx.fillText(`FINAL DATA: ${score}`, LOGIC_WIDTH / 2, LOGIC_HEIGHT / 2 + 20);

    this.ctx.fillStyle = "#00FFFF";
    this.ctx.font = "12px monospace";
    this.ctx.fillText("PRESS 'Y' TO REBOOT", LOGIC_WIDTH / 2, LOGIC_HEIGHT / 2 + 60);
  }
}