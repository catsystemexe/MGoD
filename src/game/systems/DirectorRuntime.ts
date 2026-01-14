// src/game/systems/DirectorRuntime.ts
import type { WaveDef, WaveId } from "../defs/DirectorTypes";

export type WaveRuntime = {
  id: WaveId;
  enabled: boolean;
  active: boolean;

  t: number;     // local time since activation
  acc: number;   // spawn accumulator
  spawned: number;

  def: WaveDef;
};

export function makeWaveRuntime(def: WaveDef): WaveRuntime {
  return {
    id: def.id,
    enabled: true,
    active: false,
    t: 0,
    acc: 0,
    spawned: 0,
    def,
  };
}