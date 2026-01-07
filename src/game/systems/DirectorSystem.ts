import { Phase, type EventBus } from "../../engine/core/EventBus";
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { EntityStore } from "../../engine/ecs/EntityStore";
import type { DirectorDefs, SpawnWave } from "../defs/DirectorDefs";

export interface DirectorState {
  timeSec: number;     // session time (accumulated by Loop)
  tick: number;        // current tick
}

export interface DirectorRuntime {
  enabled: boolean;    // DevUI toggle later
}

export class DirectorSystem {
  private lastSpawnAtSec = -999;

  constructor(
    private bus: EventBus<CMEventMap>,
    private store: EntityStore<any>,
    private defs: DirectorDefs,
    private runtime: DirectorRuntime = { enabled: true },
  ) {}

  /** Must run in Phase.Director */
  update(state: DirectorState): void {
    // Optional guard (pokud bus umí phase check)
    // if (this.bus.getPhase?.() !== Phase.Director) throw new Error("Director must run in Phase.Director");

    if (!this.runtime.enabled) return;

    const wave = this.pickWave(state.timeSec);
    if (!wave) return;

    const aliveEnemies = this.countAliveEnemies();
    if (aliveEnemies >= wave.maxAlive) return;

    // spawn cadence
    const interval = Math.max(0.05, wave.spawnEverySec);
    if (state.timeSec - this.lastSpawnAtSec < interval) return;

    this.lastSpawnAtSec = state.timeSec;

    // Emit spawn request (owned by Phase.Director)
    this.bus.emit(EventType.SPAWN_ENEMY, {
      typeId: wave.enemy,
      // MVP: spawn position decides SpawnSystem (random edges etc.)
      // we keep Director ignorant of coordinates, unless you want patterns.
    });
  }

  private pickWave(t: number): SpawnWave | null {
    for (const w of this.defs.waves) {
      if (t >= w.startSec && t < (w.startSec + w.durationSec)) return w;
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
