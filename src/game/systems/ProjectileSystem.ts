import { Bullet } from "../types";
import { Config } from "../../core/Config";
import { CAWorld } from "../../ca/CAWorld";
import { ParticleSystem } from "./ParticleSystem";
import { LootSystem } from "./LootSystem"; // NOVÉ
import { Vec2 } from "../../utils/math";

export class ProjectileSystem {
  private bullets: Bullet[] = [];

  constructor() {}

  reset() {
    this.bullets = [];
  }

  getBullets() {
    return this.bullets;
  }

  spawnBullet(kind: "w1" | "w2", pos: Vec2, aim: Vec2, level: number = 1) {
    const ax = aim.x - pos.x;
    const ay = aim.y - pos.y;
    const baseAngle = Math.atan2(ay, ax);

    const speedW1 = 120;
    const speedW2 = 90;

    if (kind === "w1") {
      const perpX = -Math.sin(baseAngle);
      const perpY = Math.cos(baseAngle);
      const offset = 3.0; 

      if (level === 1) {
          this.createBullet(pos.x, pos.y, baseAngle, speedW1, 1.2, 0.6, 1, "w1");
      }
      else if (level === 2) {
          this.createBullet(pos.x + perpX * offset, pos.y + perpY * offset, baseAngle, speedW1, 1.2, 0.6, 1, "w1");
          this.createBullet(pos.x - perpX * offset, pos.y - perpY * offset, baseAngle, speedW1, 1.2, 0.6, 1, "w1");
      }
      else {
          this.createBullet(pos.x, pos.y, baseAngle, speedW1, 1.2, 0.6, 1, "w1");
          this.createBullet(pos.x + perpX * offset * 2, pos.y + perpY * offset * 2, baseAngle, speedW1, 1.2, 0.6, 1, "w1");
          this.createBullet(pos.x - perpX * offset * 2, pos.y - perpY * offset * 2, baseAngle, speedW1, 1.2, 0.6, 1, "w1");
      }

    } else {
      let count = 1 + level; 
      const spreadStep = 0.08; 
      const startAngle = baseAngle - (spreadStep * (count - 1) / 2);

      for(let i=0; i<count; i++) {
        const angle = startAngle + i * spreadStep;
        this.createBullet(
            pos.x + Math.cos(angle) * 2, 
            pos.y + Math.sin(angle) * 2, 
            angle, speedW2, 0.8, 1.2, 2, "w2"
        );
      }
    }
  }

  private createBullet(x: number, y: number, angle: number, speed: number, life: number, r: number, dmg: number, kind: "w1"|"w2") {
      this.bullets.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life, r, dmg, kind
      });
  }

  // PŘIDÁN LootSystem do argumentů
  update(dtSec: number, ca: CAWorld, particles: ParticleSystem, lootSystem: LootSystem): number {
    let scoreGained = 0;

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dtSec;
      if (b.life <= 0) {
        this.bullets.splice(i, 1);
        continue;
      }
      b.x += b.vx * dtSec;
      b.y += b.vy * dtSec;

      if (b.x < 0 || b.y < 0 || b.x >= Config.WORLD_W || b.y >= Config.WORLD_H) {
        this.bullets.splice(i, 1);
        continue;
      }

      const x = Math.floor(b.x);
      const y = Math.floor(b.y);

      if (ca.isAlive(x, y)) {
        if (b.kind === "w1") {
          ca.setAlive(x, y, false);
          scoreGained += 1;
          particles.spawnDirectionalExplosion(x + 0.5, y + 0.5, 8, "rainbow", 30, 1.5, b.vx, b.vy, 0.8);
          this.tryDropLoot(x + 0.5, y + 0.5, lootSystem); // ZKUSIT DROP
          this.bullets.splice(i, 1);
        } else if (b.kind === "w2") {
          const R = 2.0;
          const x0 = Math.floor(x - R);
          const x1 = Math.ceil(x + R);
          const y0 = Math.floor(y - R);
          const y1 = Math.ceil(y + R);

          for(let ky=y0; ky<=y1; ky++) {
            for(let kx=x0; kx<=x1; kx++) {
              if((kx-x)*(kx-x) + (ky-y)*(ky-y) <= R*R) {
                if(ca.isAlive(kx, ky)) {
                  ca.setAlive(kx, ky, false);
                  scoreGained += 1;
                  this.tryDropLoot(kx + 0.5, ky + 0.5, lootSystem); // ZKUSIT DROP
                }
              }
            }
          }
          particles.spawnDirectionalExplosion(x + 0.5, y + 0.5, 20, "#FFFFFF", 50, 2.5, b.vx, b.vy, 1.0);
          particles.spawnDirectionalExplosion(x + 0.5, y + 0.5, 15, "#FF8800", 35, 2.0, b.vx, b.vy, 1.2);
          this.bullets.splice(i, 1);
        }
      }
    }
    return scoreGained;
  }

  // Velmi malá šance na drop z běžné buňky
  private tryDropLoot(x: number, y: number, lootSystem: LootSystem) {
      // 0.2% šance (1 z 500)
      if (Math.random() < 0.002) {
          const r = Math.random();
          // Většinou to bude Coin, vzácněji Health/Upgrade
          if (r < 0.7) lootSystem.spawnLoot(x, y, "coin");
          else if (r < 0.85) lootSystem.spawnLoot(x, y, "health");
          else if (r < 0.95) lootSystem.spawnLoot(x, y, "upgrade_w1");
          else lootSystem.spawnLoot(x, y, "upgrade_w2");
      }
  }
}
