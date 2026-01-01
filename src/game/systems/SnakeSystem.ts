import { Vec2, v2 } from "../../utils/math";

interface Segment {
    pos: Vec2;
}

export class SnakeSystem {
    private segments: Segment[] = [];
    private maxSegments = 3;

    reset(x: number, y: number) {
        this.segments = [];
        this.maxSegments = 3; // Start with 3 bombs
        // Pre-fill to avoid empty tail at start
        for(let i=0; i<this.maxSegments; i++) {
            this.segments.push({ pos: v2(x, y + (i+1)*5) });
        }
    }

    update(dt: number, headPos: Vec2, velocity: Vec2) {
        // Drag effect: Segments follow each other using Inverse Kinematics style constraint
        const targetDist = 12; // Distance between nodes
        let target = headPos;

        // Ensure we have enough segments
        while(this.segments.length < this.maxSegments) {
             const last = this.segments.length > 0 ? this.segments[this.segments.length-1].pos : headPos;
             this.segments.push({ pos: { ...last } });
        }
        // Remove excess
        while(this.segments.length > this.maxSegments) {
            this.segments.pop();
        }

        for (let i = 0; i < this.segments.length; i++) {
            const s = this.segments[i];
            const dx = target.x - s.pos.x;
            const dy = target.y - s.pos.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist > targetDist) {
                const angle = Math.atan2(dy, dx);
                s.pos.x = target.x - Math.cos(angle) * targetDist;
                s.pos.y = target.y - Math.sin(angle) * targetDist;
            }
            target = s.pos;
        }
    }

    getSegments() { return this.segments; }
    getLength() { return this.maxSegments; }
    hasBombs() { return this.maxSegments > 0; }
    
    removeBomb() { 
        if (this.maxSegments > 0) {
            this.maxSegments--;
            // Immediate pop to update visual instantly
            this.segments.pop();
        }
    }
    
    addBomb() {
        this.maxSegments++;
    }

    checkWhipCollision(enemies: any, particles: any) {
        // Collision logic for Spin Attack
        const segs = this.getSegments();
        for(const s of segs) {
            // Apply damage around snake segments
            if (enemies.applyAreaDamage(s.pos, 20, 5) > 0) {
                 // Visual feedback if hit
                 particles.add(s.pos, {x:0, y:0}, 0.2, "#FF00FF");
            }
        }
    }
}
