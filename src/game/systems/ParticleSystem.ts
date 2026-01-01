import { Renderer } from "../../render/Renderer";
import { Vec2 } from "../../utils/math";

export class ParticleSystem {
    update(dt: number) {}
    render(renderer: Renderer, cam: Vec2) {}
    add(pos: Vec2, vel: Vec2, life: number, color: string) {}
}
