import type { ParticleDesc } from "./ParticleTypes";

const CAPACITY = 512;
const FLOATS_PER = 10; // x, y, vx, vy, ttl, maxTtl, r, g, b, size

const OFF_X = 0;
const OFF_Y = 1;
const OFF_VX = 2;
const OFF_VY = 3;
const OFF_TTL = 4;
const OFF_MAX_TTL = 5;
const OFF_R = 6;
const OFF_G = 7;
const OFF_B = 8;
const OFF_SIZE = 9;

const KIND_SHARD = 0;
const KIND_FLASH = 1;
const KIND_FX = 2;

const KIND_MAP: Record<string, number> = { shard: KIND_SHARD, flash: KIND_FLASH, fx: KIND_FX };
const KIND_REV = ["shard", "flash", "fx"] as const;

export class ParticleStore {
  private readonly data: Float32Array;
  private readonly kinds: Uint8Array;
  private head = 0;

  constructor() {
    this.data = new Float32Array(CAPACITY * FLOATS_PER);
    this.kinds = new Uint8Array(CAPACITY);
  }

  emit(desc: ParticleDesc): void {
    const i = this.head;
    const o = i * FLOATS_PER;

    this.data[o + OFF_X] = desc.x;
    this.data[o + OFF_Y] = desc.y;
    this.data[o + OFF_VX] = desc.vx;
    this.data[o + OFF_VY] = desc.vy;
    this.data[o + OFF_TTL] = desc.ttl;
    this.data[o + OFF_MAX_TTL] = desc.maxTtl;
    this.data[o + OFF_R] = desc.r;
    this.data[o + OFF_G] = desc.g;
    this.data[o + OFF_B] = desc.b;
    this.data[o + OFF_SIZE] = desc.size;
    this.kinds[i] = KIND_MAP[desc.kind] ?? KIND_SHARD;

    this.head = (i + 1) % CAPACITY;
  }

  update(dt: number): void {
    const d = this.data;
    for (let i = 0; i < CAPACITY; i++) {
      const o = i * FLOATS_PER;
      const ttl = d[o + OFF_TTL];
      if (ttl <= 0) continue;

      const next = ttl - dt;
      if (next <= 0) {
        d[o + OFF_TTL] = 0;
        continue;
      }

      d[o + OFF_TTL] = next;
      d[o + OFF_X] += d[o + OFF_VX] * dt;
      d[o + OFF_Y] += d[o + OFF_VY] * dt;
    }
  }

  forEach(fn: (p: ParticleDesc, lifeRatio: number) => void): void {
    const d = this.data;
    for (let i = 0; i < CAPACITY; i++) {
      const o = i * FLOATS_PER;
      const ttl = d[o + OFF_TTL];
      if (ttl <= 0) continue;

      const maxTtl = d[o + OFF_MAX_TTL];
      const lifeRatio = maxTtl > 0 ? ttl / maxTtl : 0;

      fn(
        {
          x: d[o + OFF_X],
          y: d[o + OFF_Y],
          vx: d[o + OFF_VX],
          vy: d[o + OFF_VY],
          ttl,
          maxTtl,
          r: d[o + OFF_R],
          g: d[o + OFF_G],
          b: d[o + OFF_B],
          size: d[o + OFF_SIZE],
          kind: KIND_REV[this.kinds[i]] ?? "shard",
        },
        lifeRatio,
      );
    }
  }

  clear(): void {
    const d = this.data;
    for (let i = 0; i < CAPACITY; i++) {
      d[i * FLOATS_PER + OFF_TTL] = 0;
    }
    this.head = 0;
  }

  aliveCount(): number {
    let n = 0;
    const d = this.data;
    for (let i = 0; i < CAPACITY; i++) {
      if (d[i * FLOATS_PER + OFF_TTL] > 0) n++;
    }
    return n;
  }

  getCapacity(): number {
    return CAPACITY;
  }

  getRawData(): Float32Array {
    return this.data;
  }

  getRawKinds(): Uint8Array {
    return this.kinds;
  }

  getFloatsPerParticle(): number {
    return FLOATS_PER;
  }
}
