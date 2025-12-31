import { Config } from "../../core/Config";
import { ProjectileSystem } from "./ProjectileSystem";
import { ParticleSystem } from "./ParticleSystem";
import { SnakeSystem } from "./SnakeSystem";
import { LootSystem } from "./LootSystem"; // NOVÉ
import { CAWorld } from "../../ca/CAWorld";
import { Vec2 } from "../../utils/math";

export class WeaponsSystem {
  private fireAcc = 0;
  private fireInterval = 0.08;

  private cdW2 = 0;
  private cdBomb = 0;

  public readonly COST_W2 = 0; 
  public readonly COOLDOWN_W2_MAX = 0.8;
  public readonly COOLDOWN_BOMB_MAX = 3.0;

  public levelW1 = 1;
  public levelW2 = 1;
  private readonly MAX_LEVEL = 5;

  constructor() {}

  reset() {
    this.fireAcc = 0;
    this.cdW2 = 0;
    this.cdBomb = 0;
    this.levelW1 = 1;
    this.levelW2 = 1;
  }

  upgradeW1() {
    if (this.levelW1 < this.MAX_LEVEL) this.levelW1++;
  }

  upgradeW2() {
    if (this.levelW2 < this.MAX_LEVEL) this.levelW2++;
  }

  update(dtSec: number) {
    if (this.cdW2 > 0) this.cdW2 -= dtSec;
    if (this.cdBomb > 0) this.cdBomb -= dtSec;
  }

  updatePrimary(dtSec: number, lmbDown: boolean, projectileSystem: ProjectileSystem, pos: Vec2, aim: Vec2) {
    if (lmbDown) {
      this.fireAcc += dtSec;
      while (this.fireAcc >= this.fireInterval) {
        projectileSystem.spawnBullet("w1", pos, aim, this.levelW1);
        this.fireAcc -= this.fireInterval;
      }
    } else {
      this.fireAcc = 0;
    }
  }

  tryFireSecondary(projectileSystem: ProjectileSystem, pos: Vec2, aim: Vec2): boolean {
    if (this.cdW2 > 0) return false; 
    projectileSystem.spawnBullet("w2", pos, aim, this.levelW2);
    this.cdW2 = this.COOLDOWN_W2_MAX;
    return true; 
  }

  // PŘIDÁN LootSystem do argumentů
  tryFireBomb(aim: Vec2, ca: CAWorld, particles: ParticleSystem, snake: SnakeSystem, lootSystem: LootSystem): number {
    if (this.cdBomb > 0) return 0; 

    if (Config.ENABLE_PHASE2) {
      if (snake.getLength() <= 1) return 0; 
      snake.shrink();
    }

    this.cdBomb = this.COOLDOWN_BOMB_MAX;

    const R = 20.5; 
    const cx = aim.x;
    const cy = aim.y;
    const x0 = Math.max(0, Math.floor(cx - R));
    const x1 = Math.min(Config.WORLD_W - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R));
    const y1 = Math.min(Config.WORLD_H - 1, Math.ceil(cy + R));

    let scoreGained = 0;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= R * R) {
          if (ca.isAlive(x, y)) {
            ca.setAlive(x, y, false);
            scoreGained += 1;
            
            // DROP CHANCE Z BOMBY (Ještě menší, protože ničíme hodně bloků najednou)
            // 0.05% šance (1 z 2000)
            if (Math.random() < 0.0005) {
                lootSystem.spawnLoot(x + 0.5, y + 0.5, "coin"); // Z bomby padají hlavně coiny
            }
          }
        }
      }
    }

    particles.spawnChaoticRing(cx, cy, 80, "#FF0000", 50, 6.0); 
    particles.spawnChaoticRing(cx, cy, 60, "#FF5500", 40, 4.5); 
    particles.spawnChaoticRing(cx, cy, 40, "#FFFF00", 30, 3.0); 

    return scoreGained;
  }

  getStatus() {
    return {
      w2Ready: this.cdW2 <= 0,
      w2Cd: this.cdW2,
      bombReady: this.cdBomb <= 0,
      bombCd: this.cdBomb,
      lvlW1: this.levelW1,
      lvlW2: this.levelW2
    };
  }
}
