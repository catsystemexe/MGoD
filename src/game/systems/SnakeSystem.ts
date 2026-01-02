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
            this.segments.push({ pos: v2(x, y + (i+1)*12) });
        }
    }

    update(dt: number, headPos: Vec2, velocity: Vec2, facing: number) {
        // 1. Calculate Anchor Point (Where the first bomb should try to be)
        // Offset is negative direction of facing (behind the ship). 
        // Ship is approx 20-30px visual size, so we offset by ~24px to be at the engine.
        const offsetDist = 24; 
        const anchorX = headPos.x - Math.cos(facing) * offsetDist;
        const anchorY = headPos.y - Math.sin(facing) * offsetDist;

        // Ensure we have enough segments
        while(this.segments.length < this.maxSegments) {
             // Spawn new segments at the location of the last segment (or anchor if empty)
             const last = this.segments.length > 0 ? this.segments[this.segments.length-1].pos : {x: anchorX, y: anchorY};
             this.segments.push({ pos: { ...last } });
        }
        // Remove excess
        while(this.segments.length > this.maxSegments) {
            this.segments.pop();
        }

        // 2. Inverse Kinematics / Drag Logic
        // The first segment follows the Anchor Point
        // Subsequent segments follow the previous segment
        const segmentSpacing = 14; // Distance between bombs

        let targetX = anchorX;
        let targetY = anchorY;

        for (let i = 0; i < this.segments.length; i++) {
            const s = this.segments[i];
            
            const dx = targetX - s.pos.x;
            const dy = targetY - s.pos.y;
            const dist = Math.hypot(dx, dy);
            
            // If segment is too far from target (anchor or prev segment), pull it closer
            if (dist > segmentSpacing) {
                const angle = Math.atan2(dy, dx);
                s.pos.x = targetX - Math.cos(angle) * segmentSpacing;
                s.pos.y = targetY - Math.sin(angle) * segmentSpacing;
            }
            
            // Set new target for the NEXT segment to be the current segment's position
            targetX = s.pos.x;
            targetY = s.pos.y;
        }
    }

    getSegments() { return this.segments; }
    getLength() { return this.maxSegments; }
    hasBombs() { return this.maxSegments > 0; }

    getBombs() { return this.maxSegments; }

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
