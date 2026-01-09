export type MuzzleFlash = {
  alive: boolean;
  x: number; y: number;
  dx: number; dy: number; // normalized
  age: number;
  ttl: number;
  size: number;           // in logic/world units
};

export class VFXSystem {
  private muzzle: MuzzleFlash[];
  private idx = 0;

  constructor(max = 64) {
    this.muzzle = Array.from({ length: max }, () => ({
      alive: false,
      x: 0, y: 0,
      dx: 1, dy: 0,
      age: 0,
      ttl: 0.06,
      size: 3,
    }));
  }

  onSpawnProjectile(p: { x: number; y: number; dx: number; dy: number }) {
    let dx = p.dx, dy = p.dy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;

    const fx = this.muzzle[this.idx];
    this.idx = (this.idx + 1) % this.muzzle.length;

    fx.alive = true;
    fx.x = p.x;
    fx.y = p.y;
    fx.dx = dx;
    fx.dy = dy;
    fx.age = 0;
    fx.ttl = 0.06;
    fx.size = 3;
  }

  update(dtSec: number) {
    for (const fx of this.muzzle) {
      if (!fx.alive) continue;
      fx.age += dtSec;
      if (fx.age >= fx.ttl) fx.alive = false;
    }
  }

  getMuzzle(): readonly MuzzleFlash[] {
    return this.muzzle;
  }
}
