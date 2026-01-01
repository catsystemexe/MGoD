import { Vec2 } from "../../utils/math";
import { Config } from "../../core/Config";

type EnemyType = 'kamikaze' | 'orbiter' | 'turret';

interface Enemy {
    pos: Vec2;
    hp: number;
    stunned: number;
    type: EnemyType;
    angle: number; // For orbiting
    timer: number; // For attack cooldown
}

export class EnemySystem {
  private enemies: Enemy[] = [];
  
  spawn(x: number, y: number, type: EnemyType = 'kamikaze') { 
      let hp = 2;
      if (type === 'orbiter') hp = 4;
      if (type === 'turret') hp = 5;
      
      this.enemies.push({ 
          pos: { x, y }, 
          hp, 
          stunned: 0,
          type,
          angle: Math.random() * Math.PI * 2,
          timer: 2.0 + Math.random() * 2.0
      }); 
  }
  
  applyAreaDamage(center: Vec2, radius: number, damage: number): number {
      let score = 0;
      for (let i = this.enemies.length-1; i>=0; i--) {
          const e = this.enemies[i];
          const dist = Math.hypot(e.pos.x - center.x, e.pos.y - center.y);
          if (dist < radius) {
              e.hp -= damage;
              if (e.hp <= 0) {
                  score += 100 * (e.type === 'kamikaze' ? 1 : 2);
                  this.enemies.splice(i, 1);
              }
          }
      }
      return score;
  }

  update(dt: number, player: any, ca: any, part: any, bullets: any[], loot: any, onHitPlayer: (dmg: number) => void, projectileSystem?: any) {
    let score = 0;
    for (let i = this.enemies.length-1; i>=0; i--) {
      const e = this.enemies[i];
      
      // Stun Logic
      if (e.stunned > 0) {
          e.stunned -= dt;
      } else {
        // --- BEHAVIOR BY TYPE ---
        
        // 1. KAMIKAZE: Moves directly at player
        if (e.type === 'kamikaze') {
            const dist = Math.hypot(player.cur.x - e.pos.x, player.cur.y - e.pos.y);
            if (dist > 5) {
                e.pos.x += (player.cur.x - e.pos.x) / dist * 80 * dt;
                e.pos.y += (player.cur.y - e.pos.y) / dist * 80 * dt;
            }
            if (dist < 15) {
                onHitPlayer(10);
                part.add(e.pos, {x:0, y:0}, 0.5, "#FF0000"); 
                this.enemies.splice(i, 1); 
                continue; 
            }
        } 
        
        // 2. ORBITER: Circles player, emits Gliders
        else if (e.type === 'orbiter') {
            const radius = 150;
            const speed = 0.5; // rad/s (Slower)
            
            // Orbit logic: Target position on the circle
            e.angle += speed * dt;
            const targetX = player.cur.x + Math.cos(e.angle) * radius;
            const targetY = player.cur.y + Math.sin(e.angle) * radius;
            
            // Smoothly move towards target position on circle (soft follow)
            e.pos.x += (targetX - e.pos.x) * 1.0 * dt;
            e.pos.y += (targetY - e.pos.y) * 1.0 * dt;
            
            // Attack: Spawn Glider
            e.timer -= dt;
            if (e.timer <= 0) {
                const ix = Math.floor(e.pos.x / Config.CELL_SIZE);
                const iy = Math.floor(e.pos.y / Config.CELL_SIZE);
                ca.spawnGlider(ix, iy); // Stamps a glider pattern into the world
                part.add(e.pos, {x:0,y:0}, 0.5, "#FF00FF"); // Pulse effect
                // 50% Faster shooting rate (was 2.0s -> ~1.33s)
                e.timer = 1.33;
            }
        }

        // 3. TURRET: Static, lobs bombs
        else if (e.type === 'turret') {
            // Static, maybe slow rotation towards player?
            // Attack
            e.timer -= dt;
            if (e.timer <= 0) {
                if (projectileSystem) {
                    projectileSystem.spawnEnemyBomb(e.pos, player.cur);
                    part.add(e.pos, {x:0,y:0}, 0.3, "#FFAA00"); // Muzzle flash
                }
                e.timer = 3.5; // Slow fire rate
            }
        }
      }
      
      // Collision with bullets
      for (const b of bullets) {
        if (b.type !== 'bomb' && b.type !== 'enemy_bomb' && b.life > 0 && Math.hypot(b.pos.x - e.pos.x, b.pos.y - e.pos.y) < (e.type==='turret'?20:15)) {
          e.hp--; 
          b.life = 0; // Destroy bullet

          // --- COLLISION EFFECTS ---
          
          // 1. KNOCKBACK
          const knockStrength = b.knockback || 5; 
          // Normalize bullet velocity for direction
          const bSpeed = Math.hypot(b.vel.x, b.vel.y) || 1;
          e.pos.x += (b.vel.x / bSpeed) * knockStrength;
          e.pos.y += (b.vel.y / bSpeed) * knockStrength;

          // 2. HIT PARTICLES (Feedback)
          const hitColor = b.variant === 'mg' ? "#00FFFF" : "#FF8800";
          for(let i=0; i<4; i++) {
              part.add(e.pos, {x: (Math.random()-0.5)*120, y: (Math.random()-0.5)*120}, 0.2, hitColor);
          }

          // 3. PARTICLE SHARDS (Debris)
          if (b.variant === 'mg') {
              // Rainbow small shards
              const hue = Math.floor(Math.random() * 360);
              part.add(e.pos, {x:(Math.random()-0.5)*150, y:(Math.random()-0.5)*150}, 0.3, `hsl(${hue}, 100%, 50%)`);
          } else if (b.variant === 'shotgun') {
              // Big bright shards
              for(let k=0; k<3; k++) {
                  part.add(e.pos, {x:(Math.random()-0.5)*250, y:(Math.random()-0.5)*250}, 0.5, "#FFFFCC");
              }
          } else {
              // Default
              part.add(e.pos, {x:(Math.random()-0.5)*100, y:(Math.random()-0.5)*100}, 0.2, "#FF0000");
          }

          if (e.hp <= 0) { 
            // Explosion on death
            part.add(e.pos, {x:0, y:0}, 0.8, "#FFFFFF");
            score += 100 * (e.type === 'kamikaze' ? 1 : 2); 
            if (Math.random() < 0.2) loot.spawn(e.pos);
            this.enemies.splice(i, 1); 
            break; 
          }
        }
      }
    }
    return score;
  }

  render(ctx: any, cam: Vec2) {
    const ox = cam.x - ctx.canvas.width/2, oy = cam.y - ctx.canvas.height/2;
    for (const e of this.enemies) {
        if (e.type === 'kamikaze') {
            ctx.fillStyle = e.stunned > 0 ? "#FFFF00" : "#FF3333";
            ctx.fillRect(e.pos.x - ox - 6, e.pos.y - oy - 6, 12, 12);
            ctx.fillStyle = "#000";
            ctx.fillRect(e.pos.x - ox - 2, e.pos.y - oy - 2, 4, 4);
        }
        else if (e.type === 'orbiter') {
            // Pulsing blob
            const pulse = 1.0 + Math.sin(Date.now() * 0.01) * 0.2;
            ctx.fillStyle = e.stunned > 0 ? "#FFFF00" : "#AA00FF";
            ctx.beginPath();
            ctx.arc(e.pos.x - ox, e.pos.y - oy, 10 * pulse, 0, Math.PI*2);
            ctx.fill();
            // Core
            ctx.fillStyle = "#FFF";
            ctx.beginPath();
            ctx.arc(e.pos.x - ox, e.pos.y - oy, 4, 0, Math.PI*2);
            ctx.fill();
        }
        else if (e.type === 'turret') {
            ctx.fillStyle = e.stunned > 0 ? "#FFFF00" : "#FF8800";
            // Base
            ctx.fillRect(e.pos.x - ox - 10, e.pos.y - oy - 10, 20, 20);
            // Center
            ctx.fillStyle = "#330000";
            ctx.fillRect(e.pos.x - ox - 5, e.pos.y - oy - 5, 10, 10);
            // Decoration
            ctx.strokeStyle = "#FFF";
            ctx.lineWidth = 1;
            ctx.strokeRect(e.pos.x - ox - 10, e.pos.y - oy - 10, 20, 20);
        }
    }
  }
}
