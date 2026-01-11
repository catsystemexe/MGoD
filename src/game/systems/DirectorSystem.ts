// src/game/systems/DirectorSystem.ts
import { EventType, type CMEventMap } from "../../engine/core/events";
import type { AnyEvent, TickContext } from "../../engine/core/Loop";
import type { DirectorDefs } from "../defs/DirectorTypes";
import { makeWaveRuntime, type WaveRuntime } from "./DirectorRuntime";

type BusLike = {
  emitNext: <T extends keyof CMEventMap>(type: T, payload: CMEventMap[T]) => void;
};

type DirectorDeps = {
  getAliveEnemies: () => number;
  getAliveEnemiesForWave?: (waveId: string) => number; // optional but recommended
};

const isFiniteNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export class DirectorSystem {
  private difficulty = 1;
  private t = 0;
  private waves: WaveRuntime[] = [];
  private globalMaxAlive: number;

  constructor(
    private readonly bus: BusLike,
    defs: DirectorDefs,
    private readonly deps: DirectorDeps,
  ) {
      const waveDefs: any[] = Array.isArray((defs as any)?.waves) ? (defs as any).waves : [];
      console.log("[DIR][INIT] waves=", waveDefs.length, waveDefs.map((w: any) => w.id));
      this.waves = waveDefs.map(makeWaveRuntime);
    this.globalMaxAlive = defs.globalMaxAlive ?? Infinity;
  }

  // ---- HUD helper
  getHUDInfo(): { current: number } {
    // current wave number = first active wave by order (1-based)
    const idx = this.waves.findIndex(w => w.active);
    return { current: idx >= 0 ? idx + 1 : 0 };
  }

  // ---- reset runtime
  reset(): void {
    this.t = 0;
    for (const w of this.waves) {
      w.active = false;
      w.t = 0;
      w.acc = 0;
      w.spawned = 0;
    }
    // keep difficulty as-is; if you want: this.difficulty = 1;
  }

  // ---- control API
  triggerWave(id: string): void {
    const w = this.waves.find(x => x.id === id);
    if (!w || !w.enabled) return;
    if (w.def.trigger.kind === "manual") this.activate(w);
  }

  stopWave(id: string): void {
    const w = this.waves.find(x => x.id === id);
    if (!w) return;
    this.deactivate(w);
  }

  setWaveEnabled(id: string, on: boolean): void {
    const w = this.waves.find(x => x.id === id);
    if (!w) return;
    w.enabled = on;
    if (!on) this.deactivate(w);
  }

  // ---- runtime API
  setDifficulty(mult: number): void {
    const m = Number.isFinite(mult) ? mult : 1;
    this.difficulty = Math.max(0.1, Math.min(10, m));
  }

  getDifficulty(): number {
    return this.difficulty;
  }

  soloWave(id: string): void {
    for (const w of this.waves) {
      const on = w.id === id;
      w.enabled = on;
      if (!on) this.deactivate(w);
    }
  }

  enableAll(): void {
    for (const w of this.waves) w.enabled = true;
  }

  getWaveStates(): Array<{
    id: string;
    enabled: boolean;
    active: boolean;
    spawned: number;
    acc: number;
    spawnEverySec: number;
    maxAlive: number;
    trigger: any;
  }> {
    return this.waves.map(w => ({
      id: w.id,
      enabled: w.enabled,
      active: w.active,
      spawned: w.spawned,
      acc: w.acc,
      spawnEverySec: w.def.spawnEverySec,
      maxAlive: w.def.maxAlive,
      trigger: w.def.trigger,
    }));
  }

  // ---- update (Director phase)
  update(ctx: TickContext, _events: Array<AnyEvent<any>> = []): void {
    const dt = (ctx as any).dt;
    if (!isFiniteNum(dt) || dt <= 0) return;

    this.t += dt;

    const aliveGlobal = this.deps.getAliveEnemies();
    const globalCapHit = aliveGlobal >= this.globalMaxAlive;

    for (const w of this.waves) {
      if (!w.enabled) continue;

      // 1) activation via trigger
      if (this.shouldBeActive(w)) {
        if (!w.active) this.activate(w);
      } else {
        if (w.active && w.def.trigger.kind === "time") this.deactivate(w);
      }

      if (!w.active) continue;

      // 2) update local time
      w.t += dt;

      // 3) caps
      if (globalCapHit) continue;

      const aliveWave = this.deps.getAliveEnemiesForWave?.(w.id);
      if (typeof aliveWave === "number" && aliveWave >= w.def.maxAlive) continue;

      if (aliveWave === undefined && aliveGlobal >= w.def.maxAlive) continue;

      // 4) accumulator spawn (lag-safe)
      const period = Math.max(0.01, w.def.spawnEverySec / this.difficulty);
      w.acc += dt;

      const maxSpawnsThisTick = 8;
      let spawnedNow = 0;

      while (w.acc >= period && spawnedNow < maxSpawnsThisTick) {
        w.acc -= period;

        // emit spawn; include waveId for per-wave accounting (optional in event map)
        const ptn: any = (w.def as any).pattern;
        let spawn: any = undefined;

        if (ptn && ptn.kind === "grid") {
          const idx = w.spawned;
          const col = idx % Math.max(1, ptn.cols);
          const row = Math.floor(idx / Math.max(1, ptn.cols)) % Math.max(1, ptn.rows);
          spawn = {
            x: ptn.originX + col * ptn.spacingX,
            y: ptn.originY + row * ptn.spacingY,
          };
        }

        this.bus.emitNext(EventType.SPAWN_ENEMY, {
          typeId: w.def.enemyTypeId,
          waveId: w.id,
          spawn,
          behaviorPresetId: (w.def as any).behaviorPresetId,
        } as any);

        w.spawned++;
        spawnedNow++;

        if (this.deps.getAliveEnemies() >= this.globalMaxAlive) break;

        if (this.deps.getAliveEnemiesForWave) {
          if (this.deps.getAliveEnemiesForWave(w.id) >= w.def.maxAlive) break;
        }
      }
    }
  }

  private shouldBeActive(w: WaveRuntime): boolean {
    const tr = w.def.trigger;

    if (tr.kind === "manual") {
      return w.active;
    }

    const start = tr.startSec ?? 0;
    const end = tr.endSec;

    if (this.t < start) return false;
    if (typeof end === "number" && this.t >= end) return false;
    return true;
  }

  private activate(w: WaveRuntime): void {
    w.active = true;
    w.t = 0;
    w.acc = 0;
  }

  private deactivate(w: WaveRuntime): void {
    w.active = false;
    w.t = 0;
    w.acc = 0;
  }
}
