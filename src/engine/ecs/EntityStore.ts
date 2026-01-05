import type { EntityRef } from "./EntityRef";
import type { BaseEntity } from "./ComponentTypes";

/**
 * EntityStore (AoS)
 * - fixed-size slot array
 * - generation counter
 * - two-phase kill (mark + cleanup)
 */
export class EntityStore<T extends BaseEntity> {
  private entities: T[] = [];
  private freeList: number[] = [];
  private nextId = 1;

  constructor(private readonly capacity: number) {
    for (let i = 0; i < capacity; i++) {
      this.entities[i] = this.makeEmptyEntity();
      this.freeList.push(i);
    }
  }

  /** Spawn authority */
  spawn(factory: (e: T) => void): EntityRef {
    if (this.freeList.length === 0) {
      throw new Error("[EntityStore] Out of capacity");
    }
    const slot = this.freeList.pop()!;
    const e = this.entities[slot];

    // revive slot
    e.alive = true;
    e.pendingKill = false;
    e.flags = 0;
    e.id = this.nextId++;

    // factory fills components (pos, hp, kind, etc.)
    factory(e);

    return { slot, gen: e.gen };
  }

  /** Safe access */
  get(ref: EntityRef): T | null {
    const e = this.entities[ref.slot];
    if (!e.alive || e.gen !== ref.gen) return null;
    return e;
  }

  /** Mark-only kill (idempotent) */
  markKill(ref: EntityRef): void {
    const e = this.get(ref);
    if (!e) return;
    e.pendingKill = true;
  }

  /** Commit phase – must be called once per tick, last */
  cleanup(): void {
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.alive && e.pendingKill) {
        // commit kill
        e.alive = false;
        e.pendingKill = false;
        e.flags = 0;

        // bump generation to invalidate old refs
        e.gen = (e.gen + 1) & 0xffff;

        // release slot
        this.freeList.push(i);
      }
    }
  }

  /** Debug / stats */
  getAliveCount(): number {
    let c = 0;
    for (const e of this.entities) if (e.alive) c++;
    return c;
  }

  private makeEmptyEntity(): T {
    return {
      id: 0,
      gen: 0,
      alive: false,
      pendingKill: false,
      flags: 0,
    } as T;
  }
}
