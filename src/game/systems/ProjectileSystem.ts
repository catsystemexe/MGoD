import { Vec2, v2 } from "../../utils/math";
import { Config } from "../../core/Config";

export class ProjectileSystem {
  private bullets: any[] = [];
  
  // Added variant parameter to distinguish weapon types
  spawn(pos: Vec2, angle: number, speed: number, variant: 'mg' | 'shotgun' = 'mg') {
    this.bullets.push({ 
        type: 'bullet',
        variant: variant,
        pos: { ...pos }, 
        vel: { x: Math.cos(angle)*speed, y: Math.sin(angle)*speed }, 
        life: 2,
        // Properties based on variant
        knockback: variant === 'mg' ? 5 : 25, 
        damageRadius: variant === 'mg' ? 0 : 1 // 0 = single cell, 1 = cross/area
    });
  }

  spawnBomb(pos: Vec2, target: Vec2) {
      const angle = Math.atan2(target.y - pos.y, target.x - pos.x);
      const speed = 300;
      const dist = Math.hypot(target.x - pos.x, target.y - pos.y);
      const life = dist / speed;
      this.bullets.push({
          type: 'bomb',
          pos: { ...pos },
          vel: { x: Math.cos(angle)*speed, y: Math.sin(angle)*speed },
          life: life
      });
  }

  spawnEnemyBomb(pos: Vec2, target: Vec2) {
      const angle = Math.atan2(target.y - pos.y, target.x - pos.x);
      const speed = 200;
      const dist = Math.hypot(target.x - pos.x, target.y - pos.y);
      const life = dist / speed;
      this.bullets.push({
          type: 'enemy_bomb',
          pos: { ...pos },
          vel: { x: Math.cos(angle)*speed, y: Math.sin(angle)*speed },
          life: life
      });
  }

  update(dt: number, ca: any, particles: any, loot: any, camera: any, effects: any, enemies: any, playerPos?: Vec2, onHitPlayer?: (dmg: number) => void) {
    let score = 0;
    for (let i = this.bullets.length-1; i>=0; i--) {
      const b = this.bullets[i];
      b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt;
      b.life -= dt;
      
      const cs = Config.CELL_SIZE;
      const bx = Math.floor(b.pos.x / cs);
      const by = Math.floor(b.pos.y / cs);

      // --- PLAYER BOMB ---
      if (b.type === 'bomb') {
          if (b.life <= 0) {
              // HUGE Particle Explosion
              // Core blast
              particles.add(b.pos, {x:0, y:0}, 1.2, "#FFFFFF");
              particles.add(b.pos, {x:0, y:0}, 0.9, "#FFFFAA");
              
              // Expanding ring of fire (increased count)
              for(let k=0; k<150; k++) {
                  const ang = Math.random() * Math.PI * 2;
                  const spd = 100 + Math.random() * 500;
                  const color = Math.random() > 0.5 ? "#FF4400" : "#FFAA00";
                  particles.add(b.pos, {x:Math.cos(ang)*spd, y:Math.sin(ang)*spd}, 0.6 + Math.random(), color);
              }
              
              // Shockwave effect (particles expanding in a circle)
              for(let k=0; k<36; k++) {
                   const ang = (k / 36) * Math.PI * 2;
                   const spd = 400;
                   particles.add(b.pos, {x:Math.cos(ang)*spd, y:Math.sin(ang)*spd}, 0.8, "#FFFF00");
              }

              // Destroy Terrain (scaled up)
              const radius = 5; 
              for(let dy=-radius; dy<=radius; dy++) {
                  for(let dx=-radius; dx<=radius; dx++) {
                      if (dx*dx + dy*dy < radius*radius) {
                          ca.setCell(bx+dx, by+dy, 0);
                      }
                  }
              }
              // Damage Enemies
              score += enemies.applyAreaDamage(b.pos, 100, 10);
              this.bullets.splice(i, 1);
          }
          continue;
      }

      // --- ENEMY BOMB (Turret) ---
      if (b.type === 'enemy_bomb') {
          if (playerPos && onHitPlayer) {
              const distToPlayer = Math.hypot(b.pos.x - playerPos.x, b.pos.y - playerPos.y);
              if (distToPlayer < 10) {
                  onHitPlayer(15);
                  particles.add(b.pos, {x:0,y:0}, 0.5, "#FF8800");
                  this.bullets.splice(i, 1);
                  continue;
              }
          }

          if (b.life <= 0) {
             particles.add(b.pos, {x:0, y:0}, 0.5, "#FF8800"); 
             for(let k=0; k<15; k++) {
                  particles.add(b.pos, {x:(Math.random()-0.5)*200, y:(Math.random()-0.5)*200}, 0.5, "#FFFF00");
             }
             ca.splashLife(bx, by, 2);
             
             if (playerPos && onHitPlayer) {
                 const distToPlayer = Math.hypot(b.pos.x - playerPos.x, b.pos.y - playerPos.y);
                 if (distToPlayer < 30) {
                     onHitPlayer(10); 
                 }
             }
             this.bullets.splice(i, 1);
          }
          continue;
      }

      // --- STANDARD BULLET (MG & SHOTGUN) ---
      if (ca.isAlive(bx, by)) {
        
        // Destruction Logic
        if (b.damageRadius === 0) {
            // MG: 1 Bullet = 1 Cell
            ca.setCell(bx, by, 0);
        } else {
            // Shotgun: 1 Bullet = ~5 Cells (Cross shape)
            ca.setCell(bx, by, 0);
            ca.setCell(bx+1, by, 0);
            ca.setCell(bx-1, by, 0);
            ca.setCell(bx, by+1, 0);
            ca.setCell(bx, by-1, 0);
        }
        
        b.life = 0;

        // Particle Effects on Wall Hit
        if (b.variant === 'mg') {
             // Rainbow small shards
             const hue = Math.floor(Math.random() * 360);
             particles.add(b.pos, {x: (Math.random()-0.5)*50, y: (Math.random()-0.5)*50}, 0.3, `hsl(${hue}, 100%, 60%)`);
        } else {
             // Big shards for shotgun
             for(let p=0; p<3; p++) {
                particles.add(b.pos, {x: (Math.random()-0.5)*100, y: (Math.random()-0.5)*100}, 0.4, "#FFFFFF");
             }
        }
      }
      if (b.life <= 0) this.bullets.splice(i, 1);
    }
    return score;
  }
  getBullets() { return this.bullets; }
}
