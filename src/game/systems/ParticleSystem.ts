import { Particle } from "../types";
import { Vec2 } from "../../utils/math";
import { Renderer } from "../../render/Renderer";

export class ParticleSystem {
  private particles: Particle[] = [];

  constructor() {}

  reset() {
    this.particles = [];
  }

  update(dtSec: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dtSec;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      
      // Lehce variabilní drag pro přirozenější zpomalení
      const drag = 0.91 + Math.random() * 0.03; 
      p.vx *= drag;
      p.vy *= drag;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(renderer: Renderer, cam: Vec2) {
    const ctx = renderer.getContext();
    if (!ctx) return;

    const cellSize = (renderer as any).getCellSize?.() ?? 4;
    const dpr = window.devicePixelRatio || 1;
    const logicalW = ctx.canvas.width / dpr;
    const logicalH = ctx.canvas.height / dpr;
    const halfW = logicalW / 2;
    const halfH = logicalH / 2;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    (ctx as any).imageSmoothingEnabled = false;

    for (const p of this.particles) {
      const screenX = Math.floor((p.x - cam.x) * cellSize + halfW);
      const screenY = Math.floor((p.y - cam.y) * cellSize + halfH);
      
      const scale = p.life / p.maxLife;
      const size = Math.max(1, p.size * scale * cellSize);

      ctx.fillStyle = p.color;
      ctx.fillRect(screenX - size/2, screenY - size/2, size, size);
    }
    ctx.restore();
  }

  // --- Spawners ---

  spawnParticles(cx: number, cy: number, count: number, color: string, speedBase: number, size: number) {
    for(let i=0; i<count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedBase * (0.5 + Math.random());
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.4,
        maxLife: 0.7,
        color: color,
        size: size
      });
    }
  }

  spawnDirectionalExplosion(cx: number, cy: number, count: number, color: string | "rainbow", speedBase: number, size: number, dirVx: number, dirVy: number, spread: number) {
    const baseAngle = Math.atan2(dirVy, dirVx);
    for(let i=0; i<count; i++) {
      const angle = baseAngle + (Math.random() - 0.5) * spread;
      const speed = speedBase * (0.5 + Math.random());
      let c = color;
      if (color === "rainbow") {
        c = `hsl(${Math.random() * 360}, 100%, 60%)`;
      }
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.3, 
        maxLife: 0.6,
        color: c,
        size: size
      });
    }
  }

  // TATO METODA TI CHYBĚLA:
  spawnChaoticRing(cx: number, cy: number, count: number, color: string, speedBase: number, sizeBase: number) {
    for(let i=0; i<count; i++) {
      // Základní úhel (aby byly rovnoměrně rozmístěny)
      const baseAngle = (i / count) * Math.PI * 2;
      
      // CHAOS 1: Náhodná odchylka úhlu (+/- 20 stupňů)
      const angleJitter = (Math.random() - 0.5) * 0.7;
      const finalAngle = baseAngle + angleJitter;

      // CHAOS 2: Variace rychlosti (+/- 30%)
      const speed = speedBase * (0.7 + Math.random() * 0.6);

      // CHAOS 3: Variace velikosti (50% až 150% základu)
      const size = sizeBase * (0.5 + Math.random() * 1.0);

      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(finalAngle) * speed,
        vy: Math.sin(finalAngle) * speed,
        life: 0.5 + Math.random() * 0.4, // Variabilní životnost
        maxLife: 0.9,
        color: color,
        size: size 
      });
    }
  }
}
