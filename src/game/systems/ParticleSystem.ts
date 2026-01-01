import { Vec2 } from "../../utils/math";
import { Renderer } from "../../render/Renderer";

interface Particle {
    pos: Vec2;
    vel: Vec2;
    life: number;
    maxLife: number;
    color: string;
    size: number;
}

export class ParticleSystem {
    private particles: Particle[] = [];

    add(pos: Vec2, vel: Vec2, life: number, color: string, size: number = 2) {
        this.particles.push({
            pos: { ...pos },
            vel: { ...vel },
            life,
            maxLife: life,
            color,
            size
        });
    }

    update(dt: number) {
        for(let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            p.pos.x += p.vel.x * dt;
            p.pos.y += p.vel.y * dt;
            
            // Drag
            p.vel.x *= 0.95;
            p.vel.y *= 0.95;

            if(p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    render(renderer: Renderer, cam: Vec2) {
        const ctx = renderer.getContext();
        const { w, h } = renderer.getDebug();
        const ox = cam.x - w/2;
        const oy = cam.y - h/2;

        for(const p of this.particles) {
            const screenX = p.pos.x - ox;
            const screenY = p.pos.y - oy;
            
            if(screenX < -10 || screenX > w + 10 || screenY < -10 || screenY > h + 10) continue;

            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillRect(screenX, screenY, p.size, p.size);
            ctx.globalAlpha = 1.0;
        }
    }
}
