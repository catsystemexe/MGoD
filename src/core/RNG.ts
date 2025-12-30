/**
 * Deterministic RNG (Mulberry32). No Math.random usage outside.
 */
export class RNG {
  private state: number;

  constructor(seed: number) {
    // force uint32
    this.state = seed >>> 0;
  }

  next(): number {
    // returns [0,1)
    let t = (this.state += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return r;
  }

  nextInt(n: number): number {
    if (!Number.isFinite(n) || n <= 0) throw new Error("nextInt(n): n must be > 0");
    return Math.floor(this.next() * n);
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("pick(arr): empty array");
    return arr[this.nextInt(arr.length)];
  }

  getSeed(): number {
    return this.state >>> 0;
  }
}
