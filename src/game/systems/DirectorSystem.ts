// src/game/systems/DirectorSystem.ts
import type { EventBus } from "../../engine/core/EventBus";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { DirectorDefs, SpawnWave } from "../defs/DirectorDefs";

export interface DirectorState {
  timeSec: number; // session time (accumulated by Loop)
  tick: number;    // current tick
}

export interface DirectorRuntime {
  enabled: boolean; // DevUI toggle later
}

export class DirectorSystem {
  private lastSpawnAtSec = -999;

  constructor(
    private readonly bus: EventBus<CMEventMap>,
    private readonly store: EntityStore<any>,
    private readonly defs: DirectorDefs,
    private readonly runtime: DirectorRuntime = { enabled: true },
  ) {}

  /** Must run in Phase.Director (Loop enforces phase) */
  update(state: DirectorState): void {
    if (!this.runtime.enabled) return;

    const wave = this.pickWave(state.timeSec);
    if (!wave) return;

    const aliveEnemies = this.countAliveEnemies();
    if (aliveEnemies >= wave.maxAlive) return;

    // spawn cadence
    const interval = Math.max(0.05, wave.spawnEverySec);
    if (state.timeSec - this.lastSpawnAtSec < interval) return;

    this.lastSpawnAtSec = state.timeSec;
    console.log("[DIR] emitNext SPAWN_ENEMY", { enemy: wave.enemy, t: state.timeSec.toFixed(2), tick: state.tick });
    this.bus.emitNext(EventType.SPAWN_ENEMY, { typeId: wave.enemy });
    // IMPORTANT:
    // Loop drains Phase.Director BEFORE calling update(), so same-tick emissions would be missed.
    // Therefore spawn requests must go to next tick:
    this.bus.emitNext(EventType.SPAWN_ENEMY, {
      typeId: wave.enemy,
    });
  }

  private pickWave(t: number): SpawnWave | null {
    for (const w of this.defs.waves) {
      if (t >= w.startSec && t < w.startSec + w.durationSec) return w;
    }
    return null;
  }

  private countAliveEnemies(): number {
    let n = 0;
    this.store.debugForEachAlive((_ref: any, e: any) => {
      if (e.kind === "enemy") n++;
    });
    return n;
  }
}