import { Enemy, Bullet, PlayerState } from "../types";
import { PATTERNS } from "../patterns";
import { CAWorld } from "../../ca/CAWorld";
import { Config } from "../../core/Config";
import { ParticleSystem } from "./ParticleSystem";
import { LootSystem } from "./LootSystem"; // NOVÉ
import { Vec2 } from "../../utils/math";

export class EnemySystem {
  private enemies: Enemy[] = [];
  private spawnTimer = 0;
  private idCounter = 0;

  public spawnRate = 3.0; 
  public maxEnemies = 5;
  public enabledTypes: ("skiff" | "miner")[] = ["miner"];
  public active = false; 

  constructor() {}

  reset() {
    this.enemies = [];
    this.spawnTimer = 0;
    this.idCounter = 0;
    this.active = false;
  }

  setDifficulty(rate: number, max: number, types: ("skiff" | "miner")[]) {
    this.spawnRate = rate;
    this.maxEnemies = max;
    this.enabledTypes = types;
    this.active = true;
  }

  stopSpawning() {
    this.active = false;
  }

  getCount(): number {
    return this.enemies.length;
  }

  // PŘIDÁN LootSystem do argumentů
  update(dtSec: number, player: PlayerState, ca: CAWorld, particles: ParticleSystem, bullets: Bullet[], lootSystem: LootSystem): number {
    let scoreGained = 0;

    if (this.active && this.enemies.length < this.maxEnemies) {
        this.spawnTimer += dtSec;
        if (this.spawnTimer >= this.spawnRate) {
            this.spawnEnemy(player.cur);
            this.spawnTimer = 0;
        }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      
      // Separation
      let sepX = 0; let sepY = 0;
      for (const other of this.enemies) {
          if (other === e) continue;
          const dx = e.x - other.x;
          const dy = e.y - other.y;
          const d2 = dx*dx + dy*dy;
          if (d2 < 100 && d2 > 0.1) {
              const d = Math.sqrt(d2);
              sepX += (dx / d) * 50 * dtSec;
              sepY += (dy / d) * 50 * dtSec;
          }
      }
      e.vx += sepX; e.vy += sepY;

      // Movement
      const dx = player.cur.x - e.x;
      const dy = player.cur.y - e.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1; 

      if (e.type === "skiff") {
        if (dist > 5) { 
            e.vx += (dx / dist) * 20 * dtSec; 
            e.vy += (dy / dist) * 20 * dtSec;
        }
        e.vx *= 0.98; e.vy *= 0.98;
      } else {
        e.vx += (Math.random() - 0.5) * 50 * dtSec;
        e.vy += (Math.random() - 0.5) * 50 * dtSec;
        e.vx *= 0.95; e.vy *= 0.95;
      }

      e.x += e.vx * dtSec;
      e.y += e.vy * dtSec;
      
      if (!Number.isFinite(e.x)) e.x = player.cur.x + 100;
      if (!Number.isFinite(e.y)) e.y = player.cur.y + 100;

      // Action
      e.actionTimer -= dtSec;
      if (e.actionTimer <= 0) {
        const cx = Math.floor(e.x);
        const cy = Math.floor(e.y);
        
        if (e.type === "skiff") {
          this.stampPattern(ca, cx, cy, PATTERNS.GLIDER);
          particles.spawnParticles(e.x, e.y, 5, "#00FF00", 20, 1);
          e.actionInterval = 2.0;
        } else {
          this.stampPattern(ca, cx, cy, PATTERNS.BLINKER);
          particles.spawnParticles(e.x, e.y, 5, "#FFFF00", 10, 1);
          e.actionInterval = 4.0;
        }
        e.actionTimer = e.actionInterval;
      }

      // Collision
      for (let bIdx = bullets.length - 1; bIdx >= 0; bIdx--) {
        const b = bullets[bIdx];
        const bdx = b.x - e.x;
        const bdy = b.y - e.y;
        if (bdx*bdx + bdy*bdy < (e.maxHp * 2)) { 
           e.hp -= b.dmg;
           bullets.splice(bIdx, 1); 
           particles.spawnParticles(e.x, e.y, 3, "#FFFFFF", 30, 1);

           if (e.hp <= 0) {
             scoreGained += (e.type === "skiff" ? 50 : 30);
             particles.spawnDirectionalExplosion(e.x, e.y, 15, e.color, 40, 2, e.vx, e.vy, 3.14);
             
             // --- LOOT DROP LOGIC ---
             const rand = Math.random();
             if (rand < 0.4) { // 40% chance drop
                 if (rand < 0.1) lootSystem.spawnLoot(e.x, e.y, "health");
                 else if (rand < 0.15) lootSystem.spawnLoot(e.x, e.y, "upgrade_w1");
                 else if (rand < 0.20) lootSystem.spawnLoot(e.x, e.y, "upgrade_w2");
                 else lootSystem.spawnLoot(e.x, e.y, "coin");
             }

             this.enemies.splice(i, 1);
             break; 
           }
        }
      }
    }

    return scoreGained;
  }

  render(ctx: CanvasRenderingContext2D, cam: Vec2, cellSize: number) {
    const dpr = window.devicePixelRatio || 1;
    const logicalW = ctx.canvas.width / dpr;
    const logicalH = ctx.canvas.height / dpr;
    const halfW = logicalW / 2;
    const halfH = logicalH / 2;

    ctx.save();
    for (const e of this.enemies) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;

      const screenX = Math.floor((e.x - cam.x) * cellSize + halfW);
      const screenY = Math.floor((e.y - cam.y) * cellSize + halfH);

      ctx.fillStyle = e.color;
      
      if (e.type === "skiff") {
        ctx.beginPath();
        ctx.moveTo(screenX, screenY - 6);
        ctx.lineTo(screenX + 5, screenY + 6);
        ctx.lineTo(screenX - 5, screenY + 6);
        ctx.fill();
      } else {
        ctx.fillRect(screenX - 5, screenY - 5, 10, 10);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(screenX - 2, screenY - 2, 4, 4);
      }
    }
    ctx.restore();
  }

  private spawnEnemy(playerPos: Vec2) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 90; 
    const ex = playerPos.x + Math.cos(angle) * dist;
    const ey = playerPos.y + Math.sin(angle) * dist;

    const type = this.enabledTypes[Math.floor(Math.random() * this.enabledTypes.length)] || "miner";

    this.enemies.push({
      id: this.idCounter++,
      type: type,
      x: ex,
      y: ey,
      vx: 0, vy: 0,
      hp: type === "skiff" ? 3 : 5,
      maxHp: type === "skiff" ? 3 : 5,
      actionTimer: 2.0,
      actionInterval: type === "skiff" ? 2.5 : 4.0,
      color: type === "skiff" ? "#00FF00" : "#FF00FF"
    });
  }

  private stampPattern(ca: CAWorld, cx: number, cy: number, pat: any) {
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

    for (let y = 0; y < pat.h; y++) {
      for (let x = 0; x < pat.w; x++) {
        if (pat.data[y * pat.w + x] === 1) {
          ca.setAlive(cx + x - 1, cy + y - 1, true);
        }
      }
    }
  }
}
