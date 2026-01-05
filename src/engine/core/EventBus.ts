/* Captain Meow (CM) – EventBus v3.1
 * Deterministic, phase-owned, fail-fast.
 *
 * Key rules:
 *  - Events live in qNow (current tick) or qNext (next tick).
 *  - Each EventType has exactly ONE owner phase (Phase Ownership Map).
 *  - drainPhase(phase) removes only events owned by that phase.
 *  - Same-tick routing: events emitted during phase N can be drained by phase N+1
 *    if their owner phase is N+1 (because they stay in qNow).
 *  - End-of-tick invariant: qNow MUST be empty before swap (dev fail-fast).
 */

export enum Phase {
  Input = 0,
  Director = 1,
  Simulation = 2,
  Collision = 3,
  Impact = 4,
  Flow = 5,
  Audio = 6,
  Cleanup = 7,
}

export type EventType = string;

export type GameEvent<TType extends EventType = EventType, TPayload = unknown> = {
  type: TType;
  payload: TPayload;
  tick: number;
};

/**
 * Type-safe EventMap: maps EventType -> payload shape.
 * Example:
 * type MyEvents = {
 *   "SPAWN_ENEMY": { defId: string; x: number; y: number };
 *   "ENTITY_KILLED": { ref: EntityRef; reason: string };
 * };
 */
export type EventMap = Record<EventType, unknown>;

export type OwnershipMap<T extends EventMap> = {
  [K in keyof T]: Phase;
};

export type EventBusPolicy = {
  /** Maximum number of events allowed in qNow per tick (storm protection). */
  maxEventsPerTick: number;

  /** If true, EventBus will throw when invariant is violated. Recommended for dev. */
  failFast: boolean;

  /** If false, leftovers in qNow at end-of-tick are dropped (prod behavior). */
  dropLeftoversInProd: boolean;

  /** Optional hook for logging warnings/errors without hard dependency. */
  onWarn?: (msg: string) => void;
  onError?: (msg: string) => void;
};

const DEFAULT_POLICY: EventBusPolicy = {
  maxEventsPerTick: 4096,
  failFast: true,
  dropLeftoversInProd: true,
};

export class EventBus<T extends EventMap> {
  private qNow: Array<GameEvent<keyof T & string, T[keyof T]>> = [];
  private qNext: Array<GameEvent<keyof T & string, T[keyof T]>> = [];

  private tick = 0;
  private currentPhase: Phase = Phase.Input;

  constructor(
    private readonly ownership: OwnershipMap<T>,
    private readonly policy: EventBusPolicy = DEFAULT_POLICY,
  ) {}

  /** Useful for debug overlay. */
  public getTick(): number {
    return this.tick;
  }

  public getCurrentPhase(): Phase {
    return this.currentPhase;
  }
  
  public getPhase(): Phase {
    return this.currentPhase;
  }

  /** Counts are useful for DevUI and storm diagnostics. */
  public getQueueSizes(): { now: number; next: number } {
    return { now: this.qNow.length, next: this.qNext.length };
  }

  /** Call at the start of each fixed tick (Phase 0). */
  public beginTick(nextTick?: number): void {
    if (typeof nextTick === "number") this.tick = nextTick;
    this.currentPhase = Phase.Input;

    // qNow should already contain only events for this tick (from swap), or be empty.
    // We don't enforce emptiness here, because swap() is the enforcement point.
  }

  /** Call when entering a phase (helps with debugging and misuse detection). */
  public enterPhase(phase: Phase): void {
    this.currentPhase = phase;
  }

  /** Emit an event into qNow (current tick). */
  public emit<K extends keyof T & string>(type: K, payload: T[K]): void {
    this.guardEventStorm();

    const e: GameEvent<K, T[K]> = { type, payload, tick: this.tick };
    this.qNow.push(e);
  }

  /** Emit an event into qNext (next tick). */
  public emitNext<K extends keyof T & string>(type: K, payload: T[K]): void {
    const e: GameEvent<K, T[K]> = { type, payload, tick: this.tick + 1 };
    this.qNext.push(e);
  }

  /**
   * Drain ONLY events owned by the given phase.
   * Removes drained events from qNow. All other events stay in qNow for later phases.
   */
  public drainPhase(phase: Phase): Array<GameEvent<keyof T & string, T[keyof T]>> {
    const drained: Array<GameEvent<keyof T & string, T[keyof T]>> = [];
    if (this.qNow.length === 0) return drained;

    const remaining: Array<GameEvent<keyof T & string, T[keyof T]>> = [];

    for (const e of this.qNow) {
      const owner = this.ownership[e.type as keyof T];
      if (owner === phase) drained.push(e);
      else remaining.push(e);
    }

    this.qNow = remaining;
    return drained;
  }

  /**
   * End-of-tick cleanup contract:
   * - Phase 7 should have committed entity lifecycle.
   * - Audio phase drained its owned events.
   * - Now qNow MUST be empty (dev). In prod we may drop.
   * - swap() moves qNext -> qNow for the next tick.
   */
  public endTickAndSwap(): void {
    // Invariant: qNow must be empty now (all phase-owned events drained).
    if (this.qNow.length > 0) {
      const msg =
        `[EventBus] Leftover events at end-of-tick (tick=${this.tick} phase=${this.currentPhase}): ` +
        `${this.qNow.length}. This usually means missing ownership mapping or a system not draining.`;

      if (this.policy.failFast) {
        this.policy.onError?.(msg);
        throw new Error(msg);
      } else {
        this.policy.onWarn?.(msg);
        if (this.policy.dropLeftoversInProd) {
          // Drop leftovers to prevent “ghost events” in next ticks.
          this.qNow = [];
        }
      }
    }

    // Swap queues
    this.qNow = this.qNext;
    this.qNext = [];
    this.tick += 1;
    this.currentPhase = Phase.Input;
  }

  /** Debug helper: ensure your ownership map is total for declared event types. */
  public assertOwnershipComplete(): void {
    // Runtime check is limited: we can't iterate compile-time keys here.
    // But we can at least detect missing owner for emitted types.
    // (If missing, owner will be undefined and event will never drain → caught by invariant.)
  }

  private guardEventStorm(): void {
    if (this.qNow.length >= this.policy.maxEventsPerTick) {
      const msg =
        `[EventBus] Event storm detected (tick=${this.tick}). ` +
        `qNow size reached cap=${this.policy.maxEventsPerTick}.`;

      if (this.policy.failFast) {
        this.policy.onError?.(msg);
        throw new Error(msg);
      } else {
        this.policy.onWarn?.(msg);
        // In prod mode you could drop low-priority events here.
        // For now we still append, but this is a clear diagnostics hook.
      }
    }
  }
}
