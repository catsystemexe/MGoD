// src/game/systems/DirectorRuntime.ts
import type { WaveDef, WaveId } from "../defs/DirectorTypes";

export type WaveRuntime = {
  id: WaveId;
  enabled: boolean;
  active: boolean;

  // ✅ DEV override: bypass time window until stopped/reset
  forced?: boolean;

  spawnBudget: number; // how many spawns are due (accumulated), consumed on emit
  t: number;     // local time since activation
  acc: number;   // spawn accumulator
  spawned: number;

  def: WaveDef;
};

export function makeWaveRuntime(def: WaveDef): WaveRuntime {
  return {
    id: def.id,
    def,
    enabled: !!(def as any).enabled,
    active: false,

    forced: false,

    spawnBudget: 0,

    t: 0,
    acc: 0,
    spawned: 0,
  };
}