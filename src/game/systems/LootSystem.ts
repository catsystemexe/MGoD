import { Vec2 } from "../../utils/math";
import { Renderer } from "../../render/Renderer";

export type LootType = "health" | "coin" | "upgrade_w1" | "upgrade_w2";

export type Loot = {
  x: number;
  y: number;
  type: LootType;
  life: number; 
  vx: number;
  vy: number;
  hoverTime: number; 
};

export class LootSystem {
  private loots: Loot[] = [];
  
  constructor() {}

  reset() {
    this.loots = [];
  }

  spawnLoot(x: number, y: number, type: LootType) {
    this.loots.push({
      x, y, type,
      life: 20.0, 
      vx: (Math.random() - 0.5) * 40, // Výbuch do strany při dropu
      vy: (Math.random() - 0.5) * 40,
      hoverTime: Math.random() * 10
    });
  }

  update(dtSec: number, playerPos: Vec2): LootType | null {
    let collected: LootType | null = null; 

    for (let i = this.loots.length - 1; i >= 0; i--) {
      const l = this.loots[i];
      l.life -= dtSec;
      l.hoverTime += dtSec;

      // 1. Jemné kroužení na místě (Orbiting effect)
      // Aby loot nebyl úplně statický, ale "levitoval"
      const hoverSpeed = 15;
      l.vx += Math.cos(l.hoverTime * 3) * hoverSpeed * dtSec;
      l.vy += Math.sin(l.hoverTime * 3) * hoverSpeed * dtSec;

      // 2. Drag (brzdění počátečního výbuchu + stabilizace kroužení)
      l.vx *= 0.90;
      l.vy *= 0.90;

      l.x += l.vx * dtSec;
      l.y += l.vy * dtSec;

      // 3. Collection (Hitbox)
      const dx = playerPos.x - l.x;
      const dy = playerPos.y - l.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < 6.0) { // Musíš k němu dojít blízko
          collected = l.type;
          this.loots.splice(i, 1);
          continue;
      }

      if (l.life <= 0) {
        this.loots.splice(i, 1);
      }
    }
    return collected;
  }

  render(ctx: CanvasRenderingContext2D, cam: Vec2, cellSize: number) {
    const dpr = window.devicePixelRatio || 1;
    const halfW = (ctx.canvas.width / dpr) / 2;
    const halfH = (ctx.canvas.height / dpr) / 2;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();

    for (const l of this.loots) {
      const sx = Math.floor((l.x - cam.x) * cellSize + halfW);
      const sy = Math.floor((l.y - cam.y) * cellSize + halfH);

      if (l.type === "health") ctx.fillStyle = "#FF0033"; 
      else if (l.type === "coin") ctx.fillStyle = "#FFD700"; 
      else if (l.type === "upgrade_w1") ctx.fillStyle = "#00FFFF"; 
      else if (l.type === "upgrade_w2") ctx.fillStyle = "#FF8800"; 

      // Pulzování
      const size = 10 + Math.sin(l.hoverTime * 5) * 2; 
      
      ctx.shadowBlur = 15;
      ctx.shadowColor = ctx.fillStyle as string;

      ctx.beginPath();
      if (l.type === "coin") {
          ctx.fillRect(sx - size/2, sy - size/2, size, size);
      } else {
          ctx.arc(sx, sy, size/2, 0, Math.PI * 2);
          ctx.fill();
      }
      
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
}
