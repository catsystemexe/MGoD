// src/game/vfx/VFXSystem.ts

export type HitSpark = {
  alive: boolean;
  x: number; y: number;
  dx: number; dy: number; // normalized
  age: number;
  ttl: number;
  size: number;
  count: number;   // kolik “teček”
  step: number;    // rozestup
  spread: number;  // rozptyl směru (rad)
};

export type Tracer = {
  alive: boolean;
  x: number; y: number;
  dx: number; dy: number; // normalized
  age: number;
  ttl: number;
  len: number;            // total length in logic units
  step: number;           // spacing between quads
  size: number;           // quad size (thickness)
};

export type MuzzleFlash = {
  alive: boolean;
  x: number; y: number;
  dx: number; dy: number; // normalized
  age: number;
  ttl: number;
  size: number;
};

export type VFXParams = {
  muzzleTTL: number;
  muzzleSize: number;

  tracerTTL: number;
  tracerLen: number;
  tracerStep: number;
  tracerSize: number;

  hitTTL: number;
  hitCount: number;
  hitStep: number;
  hitSpread: number;
  hitSize: number;
};


export class VFXSystem {
  private muzzle: MuzzleFlash[];
  private idx = 0;

  private hits: HitSpark[];
  private hIdx = 0;
  
  private tracers: Tracer[];
  private tIdx = 0;

  
  params: VFXParams = {
    // krátký, ostrý záblesk
    muzzleTTL: 0.06,
    muzzleSize: 5,

    // tracer: čitelný “dotted/segmented” beam
    tracerTTL: 0.03,
    tracerLen: 26,
    tracerStep: 3,
    tracerSize: 2.5,

    // hit: krátká “jiskra” vpřed
    hitTTL: 0.14,
    hitCount: 8,
    hitStep: 2,
    hitSpread: 0.85,
    hitSize: 2.5,
  };



  // DEBUG toggle from console:
  // globalThis.__CM_DEBUG_VFX = true
  private static get DEBUG(): boolean {
    const g: any = globalThis as any;
    return Boolean(g.__CM_DEBUG_VFX || g.__CM_DEBUG_VFX);
  }

  // --- DEBUG (visible on iPad via hudTop) ---
  private _dbgNextMs = 0;
  private _dbgCounts = { muzzle: 0, tracer: 0, hit: 0, update: 0 };

  private dbg(tag: "muzzle" | "tracer" | "hit" | "update", payload?: any) {
    if (!VFXSystem.DEBUG) return;
    this._dbgCounts[tag]++;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now < this._dbgNextMs) return;
    this._dbgNextMs = now + 250;

    const topLog = (globalThis as any).__CM?.topLog as undefined | ((s: string) => void);
    if (!topLog) return;

    const p =
      payload && typeof payload === "object"
        ? ` x=${(payload.x ?? 0).toFixed?.(1) ?? payload.x} y=${(payload.y ?? 0).toFixed?.(1) ?? payload.y}`
        : "";

    topLog(
      `[VFX] ${tag}${p} | c=${this._dbgCounts.muzzle}/${this._dbgCounts.tracer}/${this._dbgCounts.hit} upd=${this._dbgCounts.update}`,
    );
  }

  
  constructor(max = 64) {
    this.muzzle = Array.from({ length: max }, () => ({
      alive: false,
      x: 0, y: 0,
      dx: 1, dy: 0,
      age: 0,
      ttl: 0.06,
      size: 3,
    }));

    this.tracers = Array.from({ length: max }, () => ({
      alive: false,
      x: 0, y: 0,
      dx: 1, dy: 0,
      age: 0,
      ttl: 0.08,
      len: 14,
      step: 3,
      size: 2,
    }));
  

  this.hits = Array.from({ length: max }, () => ({
    alive: false,
    x: 0, y: 0,
    dx: 1, dy: 0,
    age: 0,
    ttl: 0.10,
    size: 2,
    count: 6,
    step: 2,
    spread: 0.6,
  }));

  }
  
  private static normDir(dx: number, dy: number): { dx: number; dy: number } {
    const len = Math.hypot(dx, dy) || 1;
    return { dx: dx / len, dy: dy / len };
  }

  onSpawnProjectile(p: { x: number; y: number; dx: number; dy: number }) {
    this.dbg("muzzle", p);

    const n = VFXSystem.normDir(p.dx, p.dy);

    const fx = this.muzzle[this.idx];
    this.idx = (this.idx + 1) % this.muzzle.length;

    fx.alive = true;
    fx.x = p.x;
    fx.y = p.y;
    fx.dx = n.dx;
    fx.dy = n.dy;
    fx.age = 0;
    fx.ttl = this.params.muzzleTTL;
    fx.size = this.params.muzzleSize;
  }

  onTracer(p: { x: number; y: number; dx: number; dy: number }) {
    this.dbg("tracer", p);

    const n = VFXSystem.normDir(p.dx, p.dy);

    const fx = this.tracers[this.tIdx];
    this.tIdx = (this.tIdx + 1) % this.tracers.length;

    fx.alive = true;
    fx.x = p.x;
    fx.y = p.y;
    fx.dx = n.dx;
    fx.dy = n.dy;
    fx.age = 0;

    fx.ttl = this.params.tracerTTL;
    fx.len = this.params.tracerLen;
    fx.step = this.params.tracerStep;
    fx.size = this.params.tracerSize;
  }

  onHitSpark(p: { x: number; y: number; dx: number; dy: number }) {
    this.dbg("hit", p);

    const n = VFXSystem.normDir(p.dx, p.dy);

    const fx = this.hits[this.hIdx];
    this.hIdx = (this.hIdx + 1) % this.hits.length;

    fx.alive = true;
    fx.x = p.x;
    fx.y = p.y;
    fx.dx = n.dx;
    fx.dy = n.dy;
    fx.age = 0;

    fx.ttl = this.params.hitTTL;
    fx.size = this.params.hitSize;
    fx.count = this.params.hitCount;
    fx.step = this.params.hitStep;
    fx.spread = this.params.hitSpread;
  }


  update(dtSec: number) {
    this.dbg("update", { dtSec });

    // muzzle
    for (const fx of this.muzzle) {
      if (!fx.alive) continue;
      fx.age += dtSec;
      if (fx.age >= fx.ttl) fx.alive = false;
    }

    // tracers
    for (const fx of this.tracers) {
      if (!fx.alive) continue;
      fx.age += dtSec;
      if (fx.age >= fx.ttl) fx.alive = false;
    }

    // hits
    for (const fx of this.hits) {
      if (!fx.alive) continue;
      fx.age += dtSec;
      if (fx.age >= fx.ttl) fx.alive = false;
    }
  }
  
  getMuzzle(): readonly MuzzleFlash[] {
    return this.muzzle;
  }

  getTracers(): readonly Tracer[] {
    return this.tracers;
  }
  getHits(): readonly HitSpark[] {
    return this.hits;
  }
}