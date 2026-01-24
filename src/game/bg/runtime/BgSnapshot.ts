import { BgPreset } from "../schema/BgPreset";

export interface BgSnapshot {
  preset: BgPreset;
  resolvedSeed: number;
}
