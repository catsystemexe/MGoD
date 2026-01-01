import { Vec2 } from "../utils/math";
import { CAWorld } from "../ca/CAWorld";
import { Config } from "../core/Config";
import { PALETTE, SHIP_IDLE, SHIP_LEFT, SHIP_RIGHT, FLAME_FRAMES, EXPLOSION_FRAMES } from "./Sprites";

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true })!;
    this.ctx.imageSmoothingEnabled = false;
  }

  getContext() { return this.ctx; }
  getDebug() { return { w: this.canvas.width, h: this.canvas.height }; }

  clear() {
    this.ctx.fillStyle = "#030305";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Jemná mřížka na pozadí
    this.ctx.strokeStyle = "rgba(0, 150, 255, 0.04)";
    this.ctx.lineWidth = 1;
    const step = 64; 
    for(let x=0; x<this.canvas.width; x+=step) {
        this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, this.canvas.height); this.ctx.stroke();
    }
    for(let y=0; y<this.canvas.height; y+=step) {
        this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(this.canvas.width, y); this.ctx.stroke();
    }
  }

  drawCA(ca: CAWorld, cam: Vec2) {
    const viewW = this.canvas.width;
    const viewH = this.canvas.height;
    const cs = Config.CELL_SIZE;

    const offX = cam.x - viewW / 2;
    const offY = cam.y - viewH / 2;

    const startX = Math.floor(offX / cs);
    const startY = Math.floor(offY / cs);
    const endX = startX + Math.ceil(viewW / cs) + 1;
    const endY = startY + Math.ceil(viewH / cs) + 1;

    this.ctx.fillStyle = "#90EE90"; 

    for (let y = startY; y < endY; y++) {
      if (y < 0 || y >= ca.getHeight()) continue;
      for (let x = startX; x < endX; x++) {
        if (x < 0 || x >= ca.getWidth()) continue;

        if (ca.isAlive(x, y)) {
           const screenX = Math.floor(x * cs - offX);
           const screenY = Math.floor(y * cs - offY);
           this.ctx.fillRect(screenX, screenY, cs, cs);
        }
      }
    }
  }

  drawBullets(bullets: any[], cam: Vec2) {
    const viewW = this.canvas.width;
    const viewH = this.canvas.height;
    const offX = cam.x - viewW/2;
    const offY = cam.y - viewH/2;

    for(const b of bullets) {
        if (b.type === 'bomb') {
            this.ctx.fillStyle = "#FF0000";
            this.ctx.fillRect(Math.floor(b.pos.x - offX) - 6, Math.floor(b.pos.y - offY) - 6, 12, 12);
            this.ctx.fillStyle = "#FFF";
        } else if (b.type === 'enemy_bomb') {
            this.ctx.fillStyle = "#FF8800";
            this.ctx.beginPath();
            this.ctx.arc(b.pos.x - offX, b.pos.y - offY, 8, 0, Math.PI*2);
            this.ctx.fill();
        } else {
            this.ctx.fillStyle = "#FFFFFF";
            this.ctx.fillRect(Math.floor(b.pos.x - offX) - 2, Math.floor(b.pos.y - offY) - 2, 4, 4);
        }
    }
  }

  // --- PROCEDURAL SPRITE DRAWING ---
  
  private drawPixelSprite(data: number[][], pixelScale: number, offsetX: number, offsetY: number) {
      const rows = data.length;
      const cols = data[0].length;
      
      const drawX = offsetX - (cols * pixelScale) / 2;
      const drawY = offsetY - (rows * pixelScale) / 2;

      for(let r=0; r<rows; r++) {
          for(let c=0; c<cols; c++) {
              const colorCode = data[r][c];
              if (colorCode !== 0) {
                  this.ctx.fillStyle = PALETTE[colorCode] || "#FF00FF";
                  this.ctx.fillRect(drawX + c * pixelScale, drawY + r * pixelScale, pixelScale, pixelScale);
              }
          }
      }
  }

  drawPlayer(p: Vec2, cam: Vec2, facing: number, state: string, explosionTime: number, turnState: number) {
    const viewW = this.canvas.width;
    const viewH = this.canvas.height;
    const x = Math.floor(p.x - (cam.x - viewW/2));
    const y = Math.floor(p.y - (cam.y - viewH/2));

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(facing + Math.PI/2);
    
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

  drawSnake(segments: any[], cam: Vec2) {
    const viewW = this.canvas.width;
    const viewH = this.canvas.height;
    const offX = cam.x - viewW/2;
    const offY = cam.y - viewH/2;

    this.ctx.beginPath();
    this.ctx.strokeStyle = "#550000";
    this.ctx.lineWidth = 2; 
    if (segments.length > 0) {
        for(let i=0; i<segments.length; i++) {
             const s = segments[i];
             if (i===0) this.ctx.moveTo(s.pos.x - offX, s.pos.y - offY);
             else this.ctx.lineTo(s.pos.x - offX, s.pos.y - offY);
        }
        this.ctx.stroke();
    }

    for(const s of segments) {
        this.ctx.fillStyle = "#AA0000";
        this.ctx.beginPath();
        this.ctx.arc(s.pos.x - offX, s.pos.y - offY, 5, 0, Math.PI*2); 
        this.ctx.fill();
        this.ctx.fillStyle = "#FF0000";
        this.ctx.fillRect(s.pos.x - offX - 1, s.pos.y - offY - 1, 2, 2);
    }
  }

  drawAim(aim: Vec2, cam: Vec2) {
    const viewW = this.canvas.width;
    const viewH = this.canvas.height;
    const x = Math.floor(aim.x - (cam.x - viewW/2));
    const y = Math.floor(aim.y - (cam.y - viewH/2));
    
    this.ctx.strokeStyle = "rgba(255,255,255,0.4)";
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x-5, y-5, 10, 10);
    this.ctx.beginPath();
    this.ctx.moveTo(x, y-2); this.ctx.lineTo(x, y+2);
    this.ctx.moveTo(x-2, y); this.ctx.lineTo(x+2, y);
    this.ctx.stroke();
  }
  
  drawShootingOverlay(active: boolean) {
     // Disabled
  }

  drawDamageVignette(alpha: number) {
    if (alpha <= 0) return;
    this.ctx.fillStyle = `rgba(255, 0, 0, ${alpha * 0.15})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawGameOver(score: number) {
     this.ctx.fillStyle = "rgba(0,0,0,0.85)";
     this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
     
     this.ctx.textAlign = "center";
     
     this.ctx.fillStyle = "#FF0055";
     this.ctx.font = "bold 40px monospace";
     this.ctx.shadowBlur = 10;
     this.ctx.shadowColor = "#FF0055";
     this.ctx.fillText("SYSTEM FAILURE", this.canvas.width/2, this.canvas.height/2 - 20);
     this.ctx.shadowBlur = 0;
     
     this.ctx.fillStyle = "#FFFFFF";
     this.ctx.font = "20px monospace";
     this.ctx.fillText(`FINAL DATA: ${score}`, this.canvas.width/2, this.canvas.height/2 + 20);
     
     this.ctx.fillStyle = "#00FFFF";
     this.ctx.font = "12px monospace";
     this.ctx.fillText("PRESS 'Y' TO REBOOT", this.canvas.width/2, this.canvas.height/2 + 60);
  }
}
