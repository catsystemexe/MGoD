import { Config } from "../core/Config";

type ChunkKey = string;

type ChunkMeta = {
  hash: number;
  stableTicks: number;
  stable: boolean;
  justBecameStable: boolean;
};

export type StableChunk = {
  cx: number; // chunk coord
  cy: number;
  stableTicks: number;
};

// tiny deterministic PRNG (Mulberry32)
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randInt(r: () => number, min: number, max: number): number {
  if (max < min) [min, max] = [max, min];
  const u = r();
  return Math.floor(min + u * (max - min + 1));
}

export class CAWorld {
  private w: number;
  private h: number;
  private grid: Uint8Array;
  private next: Uint8Array;

  private aliveCount = 0;

  // Phase2 chunk meta
  private chunkMeta = new Map<ChunkKey, ChunkMeta>();

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.grid = new Uint8Array(w * h);
    this.next = new Uint8Array(w * h);
  }

  seedTestPattern(seed: number): void {
    const r = mulberry32(seed >>> 0);

    this.grid.fill(0);
    this.aliveCount = 0;

    for (let i = 0; i < (this.w * this.h) / 18; i++) {
      const x = randInt(r, 0, this.w - 1);
      const y = randInt(r, 0, this.h - 1);
      this.setAlive(x, y, true);
    }
  }

  isAlive(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.grid[y * this.w + x] === 1;
  }

  setAlive(x: number, y: number, alive: boolean): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const idx = y * this.w + x;
    const prev = this.grid[idx] === 1;
    const next = alive ? 1 : 0;
    if (prev !== (next === 1)) {
      this.grid[idx] = next;
      this.aliveCount += next === 1 ? 1 : -1;
    } else {
      this.grid[idx] = next;
    }
  }

  getAliveCount(): number {
    return this.aliveCount;
  }

  forEachAlive(fn: (x: number, y: number) => void): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.grid[y * this.w + x] === 1) fn(x, y);
      }
    }
  }

  tick(): void {
    let alive = 0;

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const idx = y * this.w + x;
        const a = this.grid[idx];

        let n = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (ox === 0 && oy === 0) continue;
            const xx = x + ox;
            const yy = y + oy;
            if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) continue;
            n += this.grid[yy * this.w + xx];
          }
        }

        let out = 0;
        if (a === 1) out = (n === 2 || n === 3) ? 1 : 0;
        else out = (n === 3) ? 1 : 0;

        this.next[idx] = out;
        alive += out;
      }
    }

    const tmp = this.grid;
    this.grid = this.next;
    this.next = tmp;
    this.aliveCount = alive;

    if (Config.ENABLE_PHASE2) {
      this.updateStability();
    }
  }

  // =========================
  // Phase 2: Stability chunks
  // =========================
  private key(cx: number, cy: number): ChunkKey {
    return `${cx},${cy}`;
  }

  private hashChunk(cx: number, cy: number): number {
    const s = Config.CHUNK_SIZE;
    const x0 = cx * s;
    const y0 = cy * s;
    const x1 = Math.min(x0 + s, this.w);
    const y1 = Math.min(y0 + s, this.h);

    let h = 2166136261 >>> 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const v = this.grid[y * this.w + x];
        h ^= (v + ((x & 31) << 1) + ((y & 31) << 2)) >>> 0;
        h = Math.imul(h, 16777619) >>> 0;
      }
    }
    return h >>> 0;
  }

  private updateStability(): void {
    const s = Config.CHUNK_SIZE;
    const cw = Math.ceil(this.w / s);
    const ch = Math.ceil(this.h / s);

    for (const meta of this.chunkMeta.values()) meta.justBecameStable = false;

    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const k = this.key(cx, cy);
        const h = this.hashChunk(cx, cy);
        const prev = this.chunkMeta.get(k);

        if (!prev) {
          this.chunkMeta.set(k, { hash: h, stableTicks: 0, stable: false, justBecameStable: false });
          continue;
        }

        if (prev.hash === h) prev.stableTicks++;
        else {
          prev.hash = h;
          prev.stableTicks = 0;
          prev.stable = false;
        }

        if (!prev.stable && prev.stableTicks >= Config.STABLE_TICKS_REQUIRED) {
          prev.stable = true;
          prev.justBecameStable = true;
        }
      }
    }
  }

  getStableChunks(): StableChunk[] {
    const out: StableChunk[] = [];
    for (const [k, meta] of this.chunkMeta.entries()) {
      if (!meta.stable) continue;
      const [cxS, cyS] = k.split(",");
      out.push({ cx: Number(cxS), cy: Number(cyS), stableTicks: meta.stableTicks });
    }
    return out;
  }

  popJustBecameStableChunks(): StableChunk[] {
    const out: StableChunk[] = [];
    for (const [k, meta] of this.chunkMeta.entries()) {
      if (!meta.justBecameStable) continue;
      meta.justBecameStable = false;
      const [cxS, cyS] = k.split(",");
      out.push({ cx: Number(cxS), cy: Number(cyS), stableTicks: meta.stableTicks });
    }
    return out;
  }

  // =========================
  // Phase 2: Injector helpers
  // =========================
  injectGlider(seed: number): void {
    const r = mulberry32(seed >>> 0);

    const x = randInt(r, 2, this.w - 4);
    const y = randInt(r, 2, this.h - 4);

    const pts = [
      [x + 1, y],
      [x + 2, y + 1],
      [x, y + 2],
      [x + 1, y + 2],
      [x + 2, y + 2]
    ];
    for (const [px, py] of pts) this.setAlive(px, py, true);
  }
}
