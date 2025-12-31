// ... (začátek souboru stejný, imports atd.)
import { Config } from "../core/Config";
import { CAWorld } from "../ca/CAWorld";
import { Vec2 } from "../utils/math";
import { Skins } from "./Skins"; 

export class Renderer {
  // ... (všechny metody až po drawSnake zůstávají stejné, zkopíruj si je nebo nech původní)
  // ... (konstruktor, resize, clear, drawGrid, drawCA, drawStableChunks, drawBullets, drawPlayer, drawAim, drawPickups)

  // --- drawBullets, drawPlayer, drawAim atd. musí v souboru zůstat ---
  // (z důvodu délky vypisuji jen změněnou metodu drawSnake, ale vlož to do třídy)

  private ctx: CanvasRenderingContext2D;
  private cellSize = 4;
  private width = 0;
  private height = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Failed to get 2D context");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
  }

  setCellSize(s: number) { this.cellSize = s; }
  getCellSize() { return this.cellSize; }
  getContext() { return this.ctx; }
  getDebug() { return { w: this.width, h: this.height }; }

  clear() {
    this.ctx.fillStyle = "#050505"; 
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // ... ZDE VLOŽ PŮVODNÍ METODY drawGrid, drawCA, drawStableChunks, drawBullets, drawPlayer, drawAim, drawPickups ...
  // Pro úplnost vkládám jen ty kritické pro kompilaci, pokud přepíšeš celý soubor:

  drawGrid(cam: Vec2) { /* viz předchozí verze */ 
    // ... (zkopíruj z minula nebo si domysli - kód se nezměnil)
    const dpr = window.devicePixelRatio || 1;
    const cs = this.cellSize;
    const viewW = this.width;
    const viewH = this.height;
    const startX = Math.floor(cam.x - (viewW / 2) / cs);
    const startY = Math.floor(cam.y - (viewH / 2) / cs);
    const endX = startX + (viewW / cs) + 1;
    const endY = startY + (viewH / cs) + 1;
    this.ctx.save();
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); 
    this.ctx.strokeStyle = "#111111"; 
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    for (let x = startX; x <= endX; x++) {
       const screenX = Math.floor((x - cam.x) * cs + viewW / 2);
       if (screenX >= 0 && screenX <= viewW) {
         this.ctx.moveTo(screenX + 0.5, 0);
         this.ctx.lineTo(screenX + 0.5, viewH);
       }
    }
    for (let y = startY; y <= endY; y++) {
       const screenY = Math.floor((y - cam.y) * cs + viewH / 2);
       if (screenY >= 0 && screenY <= viewH) {
         this.ctx.moveTo(0, screenY + 0.5);
         this.ctx.lineTo(viewW, screenY + 0.5);
       }
    }
    this.ctx.stroke();
    this.ctx.fillStyle = "#222222"; 
    const dotStep = 4; 
    const gridStartX = Math.floor(startX / dotStep) * dotStep;
    const gridStartY = Math.floor(startY / dotStep) * dotStep;
    for (let y = gridStartY; y <= endY; y += dotStep) {
        const screenY = Math.floor((y - cam.y) * cs + viewH / 2);
        if (screenY < -2 || screenY > viewH + 2) continue;
        for (let x = gridStartX; x <= endX; x += dotStep) {
            const screenX = Math.floor((x - cam.x) * cs + viewW / 2);
            if (screenX < -2 || screenX > viewW + 2) continue;
            this.ctx.fillRect(screenX - 1, screenY - 1, 2, 2);
        }
    }
    this.ctx.restore();
  }

  drawCA(ca: CAWorld, cam: Vec2) { /* viz předchozí verze */ 
    const dpr = window.devicePixelRatio || 1;
    const cs = this.cellSize;
    const ctx = this.ctx;
    const viewW = this.width;
    const viewH = this.height;
    const startX = Math.floor(cam.x - (viewW / 2) / cs);
    const startY = Math.floor(cam.y - (viewH / 2) / cs);
    const endX = startX + (viewW / cs) + 2;
    const endY = startY + (viewH / cs) + 2;
    const x0 = Math.max(0, startX);
    const y0 = Math.max(0, startY);
    const x1 = Math.min(ca.w, endX);
    const y1 = Math.min(ca.h, endY);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colorAlive = "#33FFCC"; 
    ctx.fillStyle = colorAlive;
    ctx.beginPath();
    for(let y = y0; y < y1; y++) {
        for(let x = x0; x < x1; x++) {
            if(ca.isAlive(x, y)) {
                const sx = Math.floor((x - cam.x) * cs + viewW / 2);
                const sy = Math.floor((y - cam.y) * cs + viewH / 2);
                ctx.rect(sx, sy, cs - 1, cs - 1);
            }
        }
    }
    ctx.fill();
    ctx.restore();
  }

  drawStableChunks(chunks: any[], cam: Vec2) { /* viz předchozí verze */ 
      const dpr = window.devicePixelRatio || 1;
      const cs = this.cellSize;
      const viewW = this.width;
      const viewH = this.height;
      const time = performance.now() * 0.0008; 
      this.ctx.save();
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const blockSize = 8; 
      const startX = Math.floor(cam.x - (viewW / 2) / cs);
      const startY = Math.floor(cam.y - (viewH / 2) / cs);
      const endX = startX + (viewW / cs) + 1;
      const endY = startY + (viewH / cs) + 1;
      const gridStartX = Math.floor(startX / blockSize) * blockSize;
      const gridStartY = Math.floor(startY / blockSize) * blockSize;
      for (let y = gridStartY; y <= endY; y += blockSize) {
          for (let x = gridStartX; x <= endX; x += blockSize) {
              const v1 = Math.sin(x * 0.015 + time);
              const v2 = Math.sin(y * 0.02 - time * 0.8);
              const v3 = Math.sin((x + y) * 0.01 + time * 0.5);
              const waveSum = v1 + v2 + v3; 
              let intensity = (waveSum + 3) / 6; 
              intensity = intensity * intensity; 
              const maxAlpha = 0.45; 
              const alpha = intensity * maxAlpha;
              if (alpha < 0.02) continue;
              const sx = Math.floor((x - cam.x) * cs + viewW / 2);
              const sy = Math.floor((y - cam.y) * cs + viewH / 2);
              const size = blockSize * cs;
              this.ctx.fillStyle = `rgba(20, 100, 255, ${alpha.toFixed(3)})`;
              this.ctx.fillRect(sx, sy, size + 1, size + 1);
          }
      }
      this.ctx.restore();
  }

  drawBullets(bullets: any[], cam: Vec2) { /* viz předchozí verze */ 
    const dpr = window.devicePixelRatio || 1;
    const cs = this.cellSize;
    const viewW = this.width;
    const viewH = this.height;
    this.ctx.save();
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for(const b of bullets) {
        const sx = (b.x - cam.x) * cs + viewW / 2;
        const sy = (b.y - cam.y) * cs + viewH / 2;
        this.ctx.fillStyle = "#FFF";
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, b.r * cs, 0, Math.PI*2);
        this.ctx.fill();
    }
    this.ctx.restore();
  }

  drawPlayer(p: Vec2, cam: Vec2, facing: number) { /* viz předchozí verze */ 
      const dpr = window.devicePixelRatio || 1;
      const cs = this.cellSize;
      const viewW = this.width;
      const viewH = this.height;
      const sx = (p.x - cam.x) * cs + viewW / 2;
      const sy = (p.y - cam.y) * cs + viewH / 2;
      const screenPos = { x: sx, y: sy };
      this.ctx.save();
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      Skins.advancedV1(this.ctx, screenPos, facing, cs);
      this.ctx.restore();
  }

  drawAim(aim: Vec2, cam: Vec2) { /* viz předchozí verze */ 
      const dpr = window.devicePixelRatio || 1;
      const cs = this.cellSize;
      const viewW = this.width;
      const viewH = this.height;
      const sx = Math.floor((aim.x - cam.x) * cs + viewW / 2);
      const sy = Math.floor((aim.y - cam.y) * cs + viewH / 2);
      this.ctx.save();
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      const r = 4 * cs;
      this.ctx.arc(sx, sy, r, 0, Math.PI*2);
      this.ctx.moveTo(sx - r - 2, sy);
      this.ctx.lineTo(sx + r + 2, sy);
      this.ctx.moveTo(sx, sy - r - 2);
      this.ctx.lineTo(sx, sy + r + 2);
      this.ctx.stroke();
      this.ctx.restore();
  }

  drawPickups(pickups: any[], cam: Vec2) {}

  // --- UPRAVENO PRO "Bombu na zadku" a "Magnetický řetěz" ---
  drawSnake(segments: any[], cam: Vec2, playerFacing: number) {
      if (segments.length === 0) return;

      const dpr = window.devicePixelRatio || 1;
      const cs = this.cellSize;
      const viewW = this.width;
      const viewH = this.height;

      this.ctx.save();
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 1. Spojovací paprsek (JEN mezi bombami, ne k lodi)
      // segments[length-1] je HLAVA = 1. Bomba
      if (segments.length > 1) {
          const time = performance.now() * 0.005;
          const pulse = (Math.sin(time) + 1) / 2; 
          const alpha = 0.4 + pulse * 0.4;

          this.ctx.strokeStyle = `rgba(0, 255, 255, ${alpha.toFixed(2)})`; 
          this.ctx.lineWidth = 2;
          this.ctx.shadowBlur = 10;
          this.ctx.shadowColor = "#00FFFF"; 

          this.ctx.beginPath();

          // Začneme od 1. bomby (hlavy)
          const head = segments[segments.length-1];
          const headSx = (head.x - cam.x) * cs + viewW / 2;
          const headSy = (head.y - cam.y) * cs + viewH / 2;
          this.ctx.moveTo(headSx, headSy);

          // Čára ke všem ostatním
          for(let i=segments.length-2; i>=0; i--) {
              const s = segments[i];
              const sx = (s.x - cam.x) * cs + viewW / 2;
              const sy = (s.y - cam.y) * cs + viewH / 2;
              this.ctx.lineTo(sx, sy);
          }
          this.ctx.stroke();

          // Reset shadow
          this.ctx.shadowBlur = 0;
      }

      // 2. Vykreslení VŠECH segmentů jako bomb (včetně hlavy, ta je teď 1. bomba)
      for(let i=segments.length-1; i>=0; i--) {
          const s = segments[i];
          const sx = (s.x - cam.x) * cs + viewW / 2;
          const sy = (s.y - cam.y) * cs + viewH / 2;
          const pos = { x: sx, y: sy };

          Skins.bomb(this.ctx, pos, cs);
      }

      this.ctx.restore();
  }
}
